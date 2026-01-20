import { 
    keccak256, 
    encodeFunctionData, 
    concat, 
    toHex, 
    encodeAbiParameters,
    type Address,
    type Hex 
} from "viem";

// These are the 5 owners from the vault (from console logs)
const owners = [
    "0x160acc3eba814179206fbff1e5351aedbf366633",
    "0x9e6d6522192f1c11d286f4851e3469739fe6e925",
    "0xc037f465abfb50de7b30b4708641883196210fe9",
    "0xf46d1f91e4a0e8ab4271d3379ebae968e45ae5b6",
    "0xf8f8dba81359ea730a3ca139e800fe2df10fb973"
] as Address[];

const threshold = 1;
// Salt nonce from the console logs: 0x19bd8077cbd = 1773313613501
const saltNonce = BigInt("1773313613501");

// Sort owners
const sortedOwners = [...owners].sort((a, b) => 
    a.toLowerCase().localeCompare(b.toLowerCase())
);

console.log("Sorted owners:", sortedOwners);

// Encode setup data
const setupData = encodeFunctionData({
    abi: [{
        name: "setup",
        type: "function",
        inputs: [
            { name: "_owners", type: "address[]" },
            { name: "_threshold", type: "uint256" },
            { name: "to", type: "address" },
            { name: "data", type: "bytes" },
            { name: "fallbackHandler", type: "address" },
            { name: "paymentToken", type: "address" },
            { name: "payment", type: "uint256" },
            { name: "paymentReceiver", type: "address" },
        ],
        outputs: [],
    }],
    functionName: "setup",
    args: [
        sortedOwners,
        BigInt(threshold),
        "0x0000000000000000000000000000000000000000" as Address,
        "0x" as Hex,
        "0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99" as Address,
        "0x0000000000000000000000000000000000000000" as Address,
        BigInt(0),
        "0x0000000000000000000000000000000000000000" as Address,
    ],
});

console.log("\nSetup data length:", setupData.length);

const factory = "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67" as Address;
const singleton = "0x41675C099F32341bf84BFc5382aF534df5C7461a" as Address;

const proxyCreationCode = "0x608060405234801561001057600080fd5b506040516101e63803806101e68339818101604052602081101561003357600080fd5b8101908080519060200190929190505050600073ffffffffffffffffffffffffffffffffffffffff168173ffffffffffffffffffffffffffffffffffffffff1614156100ca576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004018080602001828103825260228152602001806101c46022913960400191505060405180910390fd5b806000806101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff1602179055505060ab806101196000396000f3fe608060405273ffffffffffffffffffffffffffffffffffffffff600054167fa619486e0000000000000000000000000000000000000000000000000000000060003514156050578060005260206000f35b3660008037600080366000845af43d6000803e60008114156070573d6000fd5b3d6000f3fea264697066735822122003d1488ee65e08fa41e58e888a9865554c535f2c77126a82cb4c0f917f31441a64736f6c63430007060033496e76616c69642073696e676c65746f6e20616464726573732070726f7669646564" as Hex;

// Calculate salt
const initializerHash = keccak256(setupData);
const salt = keccak256(
    concat([
        initializerHash,
        toHex(saltNonce, { size: 32 }),
    ])
);

console.log("Initializer hash:", initializerHash);
console.log("Salt:", salt);

// Calculate init code hash
const initCode = concat([
    proxyCreationCode,
    encodeAbiParameters(
        [{ type: "address" }],
        [singleton]
    ),
]);
const initCodeHash = keccak256(initCode);

console.log("Init code hash:", initCodeHash);

// Calculate CREATE2 address
const create2Address = keccak256(
    concat([
        "0xff" as Hex,
        factory,
        salt,
        initCodeHash,
    ])
);

const safeAddress = "0x" + create2Address.slice(-40);
console.log("\n=================================");
console.log("Calculated Safe address:", safeAddress);
console.log("Expected Safe address:   0xbb52b6b4b3997ce0c0940000e229aebc154e871b");
console.log("Match:", safeAddress.toLowerCase() === "0xbb52b6b4b3997ce0c0940000e229aebc154e871b".toLowerCase());
console.log("=================================");
