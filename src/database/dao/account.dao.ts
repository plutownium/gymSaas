import { Role } from "../../enum/role.enum";
import { FREE_CREDITS } from "../../util/constants";
import { TryCatchClassDecorator } from "../../util/tryCatchClassDecorator";
import { isEmail } from "../../validationSchemas/userAuthSchemas";
import { Account, AccountCreationAttributes } from "../models/Account";
import { Profile } from "../models/Profile";
import { RefreshToken } from "../models/RefreshToken";

@TryCatchClassDecorator(Error, (err, context) => {
    console.log(context, err);
    throw err;
})
class AccountDAO {
    constructor() {}

    public async createAccount(account: AccountCreationAttributes): Promise<Account> {
        const isReallyEmail = isEmail(account.email);
        if (!isReallyEmail) throw new Error("Email field wasn't an email");
        const created: Account = await Account.create(account);
        return created;
    }

    public async createGoogleLoginAccount(fullName: string, googleId: string, email: string): Promise<Account> {
        return await Account.create({ googleId, email, passwordHash: "", role: Role.User, credits: FREE_CREDITS, name: fullName, ipAddress: "" });
    }

    public async createAdmin(email: string): Promise<number> {
        const affected = await Account.update({ role: Role.Admin }, { where: { email } });
        return affected[0];
    }

    public async getCurrentCredits(accountId: number): Promise<number> {
        const account = await Account.findOne({ where: { acctId: accountId } });
        if (account == null) throw Error("No account found for this id");
        return account.credits;
    }

    public async getAccountByAccountId(accountId: number) {
        return await Account.findByPk(accountId);
    }

    public async countAdmins(): Promise<number> {
        const accounts = await Account.findAndCountAll({ where: { role: Role.Admin } });
        return accounts.count;
    }

    public async getAllAccounts(): Promise<Account[]> {
        return await Account.findAll();
    }

    public async findAllAccountsWithTokens(): Promise<Account[]> {
        return await Account.findAll({ include: "their_refresh_tokens" });
    }

    public async getMultipleAccounts(limit: number, offset?: number): Promise<{ rows: Account[]; count: number }> {
        const accts = await Account.findAndCountAll({ offset, limit });
        return accts;
    }

    public async getAccountByGoogleId(googleId: string): Promise<Account | null> {
        const all = await Account.findAll({ where: { googleId } });
        if (all.length > 0) {
            return all[0];
        }
        return null;
    }

    public async getAccountById(id: number): Promise<Account | null> {
        return await Account.findByPk(id);
    }

    public async getAccountByEmail(email: string): Promise<Account[]> {
        const isReallyEmail = isEmail(email);
        if (!isReallyEmail) throw new Error("Email field wasn't an email");
        const acct: Account[] = await Account.findAll({
            where: { email: email },
        });
        return acct;
    }

    public async getAccountByRefreshToken(token: RefreshToken): Promise<Account | null> {
        const found = await Account.findAll({
            where: { acctId: token.acctId },
            include: "their_refresh_tokens",
        });
        if (found.length === 0) return null;
        if (found.length >= 2) throw Error("Multiple accounts for a refresh token"); // todo: log failure
        return found[0];
    }

    public async getAccountByVerificationToken(token: string): Promise<Account | null> {
        return await Account.findOne({ where: { verificationToken: token } });
    }

    // **
    // update section
    public async banUser(userId: number): Promise<number> {
        const affected = await Account.update({ isBanned: true }, { where: { acctId: userId } });
        return affected[0];
    }

    public async updateAccount(account: AccountCreationAttributes, id: number): Promise<number> {
        const affected = await Account.update(account, { where: { acctId: id } });
        return affected[0];
    }

    public async associateAccountWithProfile(accountId: number, profile: Profile): Promise<Account> {
        const account = await Account.findOne({ where: { acctId: accountId } });
        if (account === null) {
            throw new Error("Account not found for this account id");
        }
        await account.setProfile(profile);
        return account;
    }

    public async deductCredit(accountId: number): Promise<void> {
        const account = await Account.findOne({ where: { acctId: accountId } });
        if (account == null) throw Error("No account found for this id");
        const currentCredits = account.credits;
        await Account.update({ credits: currentCredits - 1 }, { where: { acctId: accountId } });
    }

    public async addFreeCredits(acctId: number): Promise<number> {
        const newAmount = await Account.update({ credits: FREE_CREDITS }, { where: { acctId } });
        return FREE_CREDITS;
    }

    // **
    // delete section **
    public async deleteAccount(id: number): Promise<number> {
        const affected = await Account.destroy({ where: { acctId: id } });
        return affected;
    }
}

export default AccountDAO;
