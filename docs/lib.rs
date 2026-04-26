#![no_std]
use soroban_sdk::{contract, contractimpl, symbol_short, Env, Symbol};

#[contract]
pub struct HelloContract;

#[contractimpl]
impl HelloContract {
    pub fn hello(_env: Env, to: Symbol) -> Symbol {
        symbol_short!("Hello")
    }
}

#[cfg(test)]
mod test;