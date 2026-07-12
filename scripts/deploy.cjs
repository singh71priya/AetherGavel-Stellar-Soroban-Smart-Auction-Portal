const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
  rpc,
  TransactionBuilder,
  Networks,
  Keypair,
  Operation,
  Address,
  Contract,
  Asset,
  nativeToScVal,
  scValToNative,
  xdr
} = require('@stellar/stellar-sdk');

const RPC_URL = 'https://soroban-testnet.stellar.org';
const server = new rpc.Server(RPC_URL);

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollTransaction(txHash) {
  console.log(`Polling transaction status for: ${txHash}`);
  let retries = 20;
  while (retries > 0) {
    const txResponse = await server.getTransaction(txHash);
    if (txResponse.status === 'SUCCESS') {
      return txResponse;
    } else if (txResponse.status === 'FAILED') {
      throw new Error(`Transaction failed: ${JSON.stringify(txResponse.resultResultXdr)}`);
    }
    await sleep(2000);
    retries--;
  }
  throw new Error('Transaction polling timed out');
}

async function run() {
  try {
    console.log('--- Starting AetherGavel Deployment ---');

    // 1. Generate a temporary deployer keypair
    const deployerKeypair = Keypair.random();
    const deployerPublicKey = deployerKeypair.publicKey();
    console.log(`Generated deployer account: ${deployerPublicKey}`);
    console.log(`Secret key (save for backup): ${deployerKeypair.secret()}`);

    // 2. Fund deployer account via Friendbot
    console.log('Funding deployer account via Friendbot...');
    const friendbotUrl = `https://friendbot.stellar.org?addr=${deployerPublicKey}`;
    const fundResponse = await fetch(friendbotUrl);
    if (!fundResponse.ok) {
      throw new Error(`Friendbot funding failed: ${await fundResponse.text()}`);
    }
    console.log('Deployer account funded successfully!');

    // Wait a brief moment for ledger confirmation
    await sleep(2000);

    // Fetch the account to verify and get sequence number
    const account = await server.getAccount(deployerPublicKey);

    // 3. Read compiled WASM
    const wasmPath = path.resolve(__dirname, '../contracts/auction/target/wasm32-unknown-unknown/release/aether_gavel.wasm');
    if (!fs.existsSync(wasmPath)) {
      throw new Error(`Compiled WASM not found at ${wasmPath}. Run cargo build first.`);
    }
    const wasmBytes = fs.readFileSync(wasmPath);
    console.log(`Loaded WASM bytecode (${wasmBytes.length} bytes)`);

    // 4. Upload WASM (Install code)
    console.log('Building uploadContractWasm transaction...');
    let tx = new TransactionBuilder(account, {
      fee: '100',
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(Operation.uploadContractWasm({ wasm: wasmBytes }))
      .setTimeout(30)
      .build();

    console.log('Simulating and preparing upload transaction...');
    let preparedTx = await server.prepareTransaction(tx);
    preparedTx.sign(deployerKeypair);

    console.log('Submitting upload transaction...');
    let sendResult = await server.sendTransaction(preparedTx);
    if (sendResult.status !== 'PENDING') {
      throw new Error(`Upload submission failed: ${JSON.stringify(sendResult)}`);
    }

    const uploadReceipt = await pollTransaction(sendResult.hash);
    console.log('uploadReceipt keys:', Object.keys(uploadReceipt));
    console.log('resultMetaXdr type:', typeof uploadReceipt.resultMetaXdr);
    if (uploadReceipt.resultMetaXdr) {
      console.log('resultMetaXdr constructor:', uploadReceipt.resultMetaXdr.constructor.name);
    }
    
    // Attempt to parse metadata safely
    let uploadMeta;
    if (typeof uploadReceipt.resultMetaXdr === 'string') {
      uploadMeta = xdr.TransactionMeta.fromXDR(uploadReceipt.resultMetaXdr, 'base64');
    } else {
      uploadMeta = uploadReceipt.resultMetaXdr; // Already parsed
    }
    
    // Let's log the return value structure
    console.log('resultXdr type:', typeof uploadReceipt.resultXdr);
    if (uploadReceipt.resultXdr) {
      console.log('resultXdr constructor:', uploadReceipt.resultXdr.constructor.name);
    }
    
    // We can extract WASM Hash. Let's see what is inside uploadReceipt
    // Typically, the WASM hash is in the transaction result return value
    let wasmHashVal = null;
    if (uploadReceipt.returnValue) {
      wasmHashVal = scValToNative(uploadReceipt.returnValue);
    }
    
    console.log(`Extracted wasmHashVal: ${wasmHashVal}`);
    
    // If wasmHashVal is not available, we can try to extract it from resultXdr or other properties
    const wasmHash = wasmHashVal || uploadReceipt.wasmValue; 
    console.log(`WASM code uploaded successfully! Hash: ${wasmHash}`);

    // Wait a brief moment
    await sleep(2000);

    // 5. Instantiate Contract
    console.log('Building createCustomContract transaction...');
    // Create random 32-byte salt
    const salt = crypto.randomBytes(32);
    const deployerAddress = Address.fromString(deployerPublicKey);

    // Fetch account again for updated sequence number
    const updatedAccount = await server.getAccount(deployerPublicKey);

    const instantiateTx = new TransactionBuilder(updatedAccount, {
      fee: '100',
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(
        Operation.createCustomContract({
          address: deployerAddress,
          wasmHash: wasmHash,
          salt: salt,
        })
      )
      .setTimeout(30)
      .build();

    console.log('Simulating and preparing instantiation transaction...');
    const preparedInstantiateTx = await server.prepareTransaction(instantiateTx);
    preparedInstantiateTx.sign(deployerKeypair);

    console.log('Submitting instantiation transaction...');
    const instantiateSendResult = await server.sendTransaction(preparedInstantiateTx);
    if (instantiateSendResult.status !== 'PENDING') {
      throw new Error(`Instantiation submission failed: ${JSON.stringify(instantiateSendResult)}`);
    }

    const instantiateReceipt = await pollTransaction(instantiateSendResult.hash);
    
    // Extract Contract ID directly from the transaction return value
    if (!instantiateReceipt.returnValue) {
      throw new Error("Instantiation transaction did not return a value");
    }
    const contractId = scValToNative(instantiateReceipt.returnValue);
    console.log(`Contract instantiated successfully! Contract ID: ${contractId}`);

    // Wait a brief moment
    await sleep(2000);

    // 6. Initialize the contract
    console.log('Initializing contract state...');
    const contract = new Contract(contractId);
    
    const latestAccount = await server.getAccount(deployerPublicKey);
    
    const initTx = new TransactionBuilder(latestAccount, {
      fee: '100',
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(
        contract.call(
          'initialize',
          deployerAddress.toScVal(), // admin
          Address.fromString(Asset.native().contractId(Networks.TESTNET)).toScVal(), // token (Native SAC)
          nativeToScVal('AetherGavel #804: Celestial Core', { type: 'string' }), // title
          nativeToScVal(100000000n, { type: 'i128' }), // min_bid (10 XLM, since XLM has 7 decimals, 10 * 10^7 = 100000000 stroops)
          nativeToScVal(1800n, { type: 'u64' }) // duration: 1800 seconds (30 minutes) for easy demo/testing!
        )
      )
      .setTimeout(30)
      .build();

    console.log('Simulating and preparing initialization transaction...');
    const preparedInitTx = await server.prepareTransaction(initTx);
    preparedInitTx.sign(deployerKeypair);

    console.log('Submitting initialization transaction...');
    const initSendResult = await server.sendTransaction(preparedInitTx);
    if (initSendResult.status !== 'PENDING') {
      throw new Error(`Initialization submission failed: ${JSON.stringify(initSendResult)}`);
    }

    await pollTransaction(initSendResult.hash);
    console.log('Contract initialized successfully!');

    // 7. Write configuration to src/contract-config.json
    const configPath = path.resolve(__dirname, '../src/contract-config.json');
    const configData = {
      contractId: contractId,
      admin: deployerPublicKey,
      tokenAddress: Asset.native().contractId(Networks.TESTNET),
      networkPassphrase: Networks.TESTNET,
      rpcUrl: RPC_URL,
    };

    fs.writeFileSync(configPath, JSON.stringify(configData, null, 2));
    console.log(`Saved configuration to ${configPath}`);

    console.log('\n--- Deployment Complete ---');
    console.log(`Contract Address: ${contractId}`);
    console.log(`Admin Address:    ${deployerPublicKey}`);
    console.log('You can now launch the frontend!');

  } catch (error) {
    console.error('Deployment failed with error:', error);
    process.exit(1);
  }
}

run();
