import bcrypt from "bcrypt";
import { iap } from "googleapis/build/src/apis/iap";
import AccountDAO from "../database/dao/account.dao";
import ProfileDAO from "../database/dao/profile.dao";
import RefreshTokenDAO from "../database/dao/refreshToken.dao";
import ResetTokenDAO from "../database/dao/resetToken.dao";
import { Account } from "../database/models/Account";
import { RefreshToken } from "../database/models/RefreshToken";
import { ResetToken } from "../database/models/ResetToken";
import { Role } from "../enum/role.enum";
import { IAccount } from "../interface/Account.interface";
import { IBasicDetails } from "../interface/BasicDetails.interface";
import { IRegistrationDetails } from "../interface/RegistrationDetails.interface";
import { UserFromGoogle } from "../interface/UserFromGoogle.interface";
import AccountUtil from "../util/accountUtil";
import EmailService from "./email.service";

class AuthService {
    private accountUtil: AccountUtil;
    private accountDAO: AccountDAO;
    private profileDAO: ProfileDAO;
    private resetTokenDAO: ResetTokenDAO;
    private emailService: EmailService;
    private refreshTokenDAO: RefreshTokenDAO;
    constructor(
        emailService: EmailService,
        accountUtil: AccountUtil,
        accountDAO: AccountDAO,
        profileDAO: ProfileDAO,
        resetTokenDAO: ResetTokenDAO,
        refreshTokenDAO: RefreshTokenDAO,
    ) {
        this.emailService = emailService;
        this.accountUtil = accountUtil;
        this.accountDAO = accountDAO;
        this.resetTokenDAO = resetTokenDAO;
        this.profileDAO = profileDAO;
        this.refreshTokenDAO = refreshTokenDAO;
    }

    public async grantRefreshToken(infoFromGoogle: UserFromGoogle, ipAddress: string): Promise<IBasicDetails> {
        // this method is used after the user logs in via google.
        // they are redirected to this callback URL, which receives their user details
        // and an ip address (probably one of google's).
        const accountEntry = await this.accountDAO.getAccountByGoogleId(infoFromGoogle.googleId);
        if (accountEntry === null) {
            throw new Error("Google SSO registration failed");
        }
        const account: IAccount = this.accountUtil.convertAccountModelToInterface(accountEntry);
        const refreshToken: RefreshToken = await this.accountUtil.generateRefreshToken(account, ipAddress);
        // save refresh tokenm\
        await refreshToken.save();
        return { ...this.basicDetails(account), refreshToken: refreshToken.token };
    }

    public async authenticate(email: string, password: string, ipAddress: string): Promise<IBasicDetails> {
        let acctArr: Account[] = await this.accountDAO.getAccountByEmail(email);
        if (acctArr.length === 0) throw new Error("No account found for this email");
        if (acctArr.length >= 2) throw new Error("More than one account found for this email");

        const acct = acctArr[0];
        const passwordIsCorrect = bcrypt.compareSync(password, acct.passwordHash);
        if (!acct.isVerified) {
            throw Error("Verify your account to log in");
        }
        if (!acct || !passwordIsCorrect) {
            throw new Error("Email or password is incorrect");
        }
        const account: IAccount = this.accountUtil.convertAccountModelToInterface(acct);
        // authentication successful so generate jwt and refresh tokens
        const jwtToken: string = this.accountUtil.generateJwtToken(account);
        const refreshToken: RefreshToken = await this.accountUtil.generateRefreshToken(account, ipAddress);
        // save refresh tokenm
        await refreshToken.save();
        // return basic details and tokens
        return {
            ...this.basicDetails(account),
            jwtToken: jwtToken,
            refreshToken: refreshToken.token,
        };
    }

    public async register(params: IRegistrationDetails, ipAddr: string, origin: string): Promise<IBasicDetails> {
        const acctsWithThisEmail: Account[] = await this.accountDAO.getAccountByEmail(params.email);
        const emailAlreadyExists: boolean = acctsWithThisEmail.length !== 0;
        if (emailAlreadyExists) {
            // send already registered error in email to prevent account enumeration
            await this.emailService.sendAlreadyRegisteredEmail(params.email, acctsWithThisEmail[0].acctId);
            throw new Error("Account with this email already exists");
        }
        // create account object
        const acctWithPopulatedFields = await this.accountUtil.attachMissingDetails(params, ipAddr);
        const acct: Account = await this.accountDAO.createAccount(acctWithPopulatedFields);
        acct.verificationToken = this.accountUtil.randomTokenString().slice(0, 6);

        // hash password
        acct.passwordHash = this.accountUtil.hash(params.password);

        // save account
        await acct.save();

        // send email
        const account = this.accountUtil.convertAccountModelToInterface(acct);
        await this.emailService.sendVerificationEmail(account, account.acctId);
        return {
            ...this.basicDetails(account),
        };
    }

    public async createOrAssociateProfile(email: string): Promise<void> {
        const accountArr = await this.accountDAO.getAccountByEmail(email);
        if (accountArr.length === 0) throw new Error("No account found for this email");
        if (accountArr.length >= 2) throw new Error("More than one account found for this email");
        const account = accountArr[0];
        const accountIp = account.ipAddress;
        const relatedProfile = await this.profileDAO.getProfileByIp(accountIp);
        if (relatedProfile === null) {
            const created = await this.profileDAO.createProfileByIp(accountIp);
            await this.accountDAO.associateAccountWithProfile(account.acctId, created);
            return;
        }
        await this.accountDAO.associateAccountWithProfile(account.acctId, relatedProfile);
        return;
    }

    public async createProfileForGoogleUser(email: string, ipAddress: string): Promise<void> {
        const accountArr = await this.accountDAO.getAccountByEmail(email);
        if (accountArr.length === 0) throw new Error("No account found for this email");
        if (accountArr.length >= 2) throw new Error("More than one account found for this email");
        const account = accountArr[0];
        const relatedProfile = await this.profileDAO.getProfileByIp(ipAddress);
        if (relatedProfile === null) {
            const created = await this.profileDAO.createProfileByIp(ipAddress);
            await this.accountDAO.associateAccountWithProfile(account.acctId, created);
            return;
        }
        await this.accountDAO.associateAccountWithProfile(account.acctId, relatedProfile);
        return;
    }

    public async refreshToken(tokenString: string, ipAddress: string) {
        const refreshToken = await this.accountUtil.getRefreshTokenByTokenString(tokenString);
        // todo: kmChangeToLatlong
        const acct: Account | null = await this.accountDAO.getAccountByRefreshToken(refreshToken);
        const noAccountFound = acct == null;
        if (noAccountFound) {
            throw Error("No account found for refresh token"); // todo: log failure
        }
        const account: IAccount = this.accountUtil.convertAccountModelToInterface(acct);

        // replace old refresh token with a new one and save
        const newRefreshToken = await this.accountUtil.generateRefreshToken(account, ipAddress);
        refreshToken.revoked = new Date();
        refreshToken.revokedByIp = ipAddress;
        refreshToken.replacedByToken = newRefreshToken.token;
        await refreshToken.save();
        await newRefreshToken.save();

        // generate new jwt
        const jwtToken = this.accountUtil.generateJwtToken(account);
        // return basic details and tokens
        return {
            ...this.basicDetails(account),
            jwtToken,
            refreshToken: newRefreshToken.token,
        };
    }

    public async userOwnsToken(acctId: number, submittedToken: string): Promise<boolean> {
        const refreshTokens = await this.refreshTokenDAO.getAllRefreshTokensForAccount(acctId);
        const userOwnsToken = refreshTokens.find((refreshToken: RefreshToken) => refreshToken.token === submittedToken) !== undefined;
        return userOwnsToken;
    }

    public async revokeToken(tokenString: string, ipAddress: string) {
        const refreshToken = await this.accountUtil.getRefreshTokenByTokenString(tokenString);
        // revoke token and save
        refreshToken.revoked = new Date();
        refreshToken.revokedByIp = ipAddress;
        await refreshToken.save();
    }

    public async verifyEmail(token: string): Promise<{ success: boolean; accountEmail: string }> {
        const account: Account | null = await this.accountDAO.getAccountByVerificationToken(token);
        if (account === null) throw new Error("Verification failed");

        account.verificationToken = ""; // string value that is closest to 'undefined'
        account.isVerified = true;
        await account.save();
        return { success: true, accountEmail: account.email };
    }

    public async updatePassword(email: string, oldPw: string, newPw: string) {
        const accountArr: Account[] = await this.accountDAO.getAccountByEmail(email);

        // always return ok response to prevent email enumeration
        if (accountArr.length === 0) return false;
        const account = accountArr[0];

        // check the starting passwords are the same
        const correctInputPw = bcrypt.compareSync(oldPw, account.passwordHash);
        if (!correctInputPw) return false;

        const hashed = this.accountUtil.hash(newPw);
        account.passwordHash = hashed;
        await account.save();
        return true;
    }

    public async forgotPassword(email: string) {
        const acct: Account[] = await this.accountDAO.getAccountByEmail(email);

        // always return ok response to prevent email enumeration
        if (acct.length === 0) return;

        // create reset token that expires after 24 hours
        const token = this.accountUtil.randomTokenString();
        const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);

        // we don't need to return anything here; rather it's added to the db so the user can submit the token in the next step
        await this.resetTokenDAO.createResetToken(acct[0].acctId, token, expires);
        // send email
        const account = this.accountUtil.convertAccountModelToInterface(acct[0]);
        account.resetToken = {
            token: token,
            expires: expires,
        };
        await this.emailService.sendPasswordResetEmail(account, account.acctId);
    }

    public async validateResetToken(token: string) {
        const resetToken: ResetToken | null = await this.resetTokenDAO.getResetTokenByToken(token);
        if (!resetToken) return false;
        // throw new Error("Invalid token");
        const account = await this.accountDAO.getAccountById(resetToken.acctId);

        if (!account) return false;
        // throw new Error("Invalid token");
        return true;
    }

    public async resetPassword(token: string, password: string) {
        const resetToken: ResetToken | null = await this.resetTokenDAO.getResetTokenByToken(token);
        if (!resetToken) throw new Error("Invalid token");
        const account = await this.accountDAO.getAccountById(resetToken.acctId);
        if (!account) throw new Error("Invalid token");
        // update password and remove reset token
        account.passwordHash = this.accountUtil.hash(password);
        account.passwordReset = Date.now();
        const resetTokenForAccount = await this.resetTokenDAO.getAllResetTokensForAccount(account.acctId);
        for await (const token of resetTokenForAccount) {
            await this.resetTokenDAO.deleteResetTokenByModel(token);
        }
        await account.save();
        return true;
    }

    public async getRemainingCredits(acctId: number): Promise<number> {
        const acct = await this.accountDAO.getAccountById(acctId);
        if (acct === null) {
            throw Error("No account found for this id");
        }
        return acct.credits;
    }

    public async addFreeCredits(acctId: number): Promise<number> {
        const acct = await this.accountDAO.getAccountById(acctId);
        if (acct === null) {
            throw Error("No account found for this id");
        }
        const freeCreditsAmount = await this.accountDAO.addFreeCredits(acctId);
        return freeCreditsAmount;
    }

    // authorized
    public async getAllAccounts() {
        const accounts: Account[] = await this.accountDAO.getAllAccounts();
        return accounts.map((a: Account) => this.basicDetails(a));
    }

    public async getAccountById(id: number) {
        const account: Account = await this.getAccount(id);
        return this.basicDetails(account);
    }

    public async createAccount(params: any) {
        // "what's in params?" => consult registerUserSchema
        // validate email
        if (await this.accountDAO.getAccountByEmail(params.email)) {
            throw 'Email "' + params.email + '" is already registered';
        }

        const account: Account = await this.accountDAO.createAccount(params);
        // account.verified = "";

        // hash password
        account.passwordHash = this.accountUtil.hash(params.password);

        // save account
        await account.save();

        return this.basicDetails(account);
    }

    public async updateAccount(id: number, params: any) {
        const account = await this.getAccount(id);

        // validate (if email was changed)
        if (params.email && account.email !== params.email && (await this.accountDAO.getAccountByEmail(params.email))) {
            throw 'Email "' + params.email + '" is already taken';
        }

        // hash password if it was entered
        if (params.password) {
            params.passwordHash = this.accountUtil.hash(params.password);
        }

        // copy params to account and save
        Object.assign(account, params);
        account.updated = Date.now();
        await account.save();

        return this.basicDetails(account);
    }

    public async deleteAccount(id: string) {
        await this.deleteAccount(id);
    }

    private basicDetails(account: IAccount | Account): IBasicDetails {
        const { acctId, email, role, updated, isVerified, credits, name } = account;
        const definitelyARole = role as Role;
        return { acctId, email, role: definitelyARole, updated, isVerified, credits, name };
    }

    private async getAccount(id: number) {
        const account = await this.accountDAO.getAccountById(id);
        if (!account) throw new Error("Account not found");
        return account;
    }

    public async logVerificationToken(email: string) {
        const account = await this.accountDAO.getAccountByEmail(email);
        console.log("token for email" + email + " is " + account[0].verificationToken);
    }
}

export default AuthService;
