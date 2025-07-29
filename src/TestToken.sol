// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract TestToken is ERC20 {
    uint8 private _decimals;
    
    constructor(
        string memory name,
        string memory symbol,
        uint8 decimals_,
        address initialMintTo,
        uint256 initialSupply
    ) ERC20(name, symbol) {
        _decimals = decimals_;
        _mint(initialMintTo, initialSupply);
    }
    
    function decimals() public view virtual override returns (uint8) {
        return _decimals;
    }
    
    // Allow anyone to mint more tokens for testing purposes
    function mint(address to, uint256 amount) public {
        _mint(to, amount);
    }
}
