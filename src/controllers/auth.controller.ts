import express, { NextFunction, Request, response, Response } from "express";

import {
    authenticateUserSchema,
    createAccountSchema,
    forgotPasswordSchema,
    registerUserSchema,
    updatePasswordSchema,
    resetPasswordSchema,
    revokeTokenSchema,
    updateRoleSchema,
    validateResetTokenSchema,
    verifyEmailSchema,
} from "../validationSchemas/userAuthSchemas";
import authorize from "../middleware/authorize.middleware";
import { Role } from "../enum/role.enum";
import AuthService from "../service/auth.service";
import { IBasicDetails } from "../interface/BasicDetails.interface";
import { handleErrorResponse } from "../util/handleErrorResponse";
import { HealthCheck } from "../enum/healthCheck.enum";
import { googleAuth, googleAuthCallback } from "../middleware/passport.middleware";
import { UserFromGoogle } from "../interface/UserFromGoogle.interface";
import { isString } from "../validationSchemas/inputValidation";
import { getFrontendURL } from "../util/URLMaker";

class AuthController {
    public path = "/auth";
    public router = express.Router();
    private authService: AuthService;

    constructor(authService: AuthService) {
        this.authService = authService;
        // ** passport stuff
        this.router.get("/google", googleAuth);
        // Retrieve member data using the access token received;
        this.router.get("/google/callback", googleAuthCallback, this.grantAccessToken.bind(this));
        // ** end passport stuff
        // login & register
        this.router.post("/register", registerUserSchema, this.register.bind(this));
        this.router.post("/authenticate", authenticateUserSchema, this.authenticate.bind(this));
        // verify email
        this.router.post("/verify-email", verifyEmailSchema, this.verifyEmail.bind(this));
        this.router.get("/bypass-authentication-token", this.bypassEmail.bind(this));
        // tokens
        this.router.post("/refresh-token", this.refreshToken.bind(this));
        // note: /revoke-token === /log-out
        this.router.post("/revoke-token", authorize([Role.User]), revokeTokenSchema, this.revokeToken.bind(this));
        // update pw
        this.router.post("/update-password", authorize([Role.User]), updatePasswordSchema, this.updatePassword.bind(this));
        // pw reset
        this.router.post("/forgot-password", forgotPasswordSchema, this.forgotPassword.bind(this));
        this.router.post("/validate-reset-token", validateResetTokenSchema, this.validateResetToken.bind(this));
        this.router.post("/reset-password", resetPasswordSchema, this.resetPassword.bind(this));
        // misc - payment stuff
        this.router.get("/remaining-credits", authorize([Role.User]), this.getRemainingCredits.bind(this));
        this.router.put("/free-credits", authorize([Role.User]), this.getFreeCredits.bind(this));
        // authorized routes
        this.router.get("/", authorize([Role.Admin]), this.getAllAccounts.bind(this));
        this.router.get("/:id", authorize(), this.getAccountById.bind(this));
        this.router.post("/", authorize([Role.Admin]), createAccountSchema, this.createAccount.bind(this));
        this.router.put("/:id", authorize(), updateRoleSchema, this.updateAccount.bind(this));
        this.router.delete("/:id", authorize(), this._deleteAccount.bind(this));
        this.router.get(HealthCheck.healthCheck, this.healthCheck);
    }

    // **
    // ** passport stuff
    public async grantAccessToken(request: Request, response: Response) {
        // https://www.makeuseof.com/nodejs-google-authentication/
        // "If you log in, you will receive the token."
        try {
            const newUser = request.user as UserFromGoogle;
            const ipAddress = request.ip;
            const accountDetails: IBasicDetails = await this.authService.grantRefreshToken(newUser, ipAddress);
            // make a profile for them
            try {
                await this.authService.createProfileForGoogleUser(newUser.email, ipAddress);
            } catch (err) {
                return handleErrorResponse(response, err);
            }

            if (accountDetails.refreshToken === undefined) throw Error("refresh token missing from authenticate response");
            this.setTokenCookie(response, accountDetails.refreshToken);
            const redirectURL = getFrontendURL() + "/dashboard";
            console.log(redirectURL, "should say apartmentsneargyms.com, 85rm");
            return response.redirect(redirectURL); // user gets access token from refresh-token endpoint.
        } catch (err) {
            return handleErrorResponse(response, err);
        }
    }

    public async authenticate(request: Request, response: Response, next: NextFunction) {
        try {
            const email: string = request.body.email;
            const password: string = request.body.password;
            const ipAddress: string = request.ip;
            const accountDetails: IBasicDetails = await this.authService.authenticate(email, password, ipAddress);
            if (accountDetails.jwtToken === undefined) throw Error("jwt missing from authenticate response");
            if (accountDetails.refreshToken === undefined) throw Error("refresh token missing from authenticate response");
            this.setTokenCookie(response, accountDetails.refreshToken);
            delete accountDetails.refreshToken;
            return response.json({ ...accountDetails, jwtToken: accountDetails.jwtToken });
        } catch (err) {
            return handleErrorResponse(response, err);
        }
    }

    public async register(request: Request, response: Response, next: NextFunction) {
        try {
            const origin = request.get("origin") || ""; // fixme: what on earth is origin and do I even need it?
            const ipAddr = request.ip;
            if (origin === undefined) {
                return handleErrorResponse(response, "Origin is required and was undefined");
            }
            const accountDetails: IBasicDetails = await this.authService.register(request.body, ipAddr, origin);
            return response.json({
                message: "Registration successful, please check your email for a verification code",
                accountDetails,
            });
        } catch (err) {
            return handleErrorResponse(response, err);
        }
    }

    public async verifyEmail(request: Request, response: Response) {
        try {
            const tokenInput = request.body.verificationCode;
            const token = isString(tokenInput);
            const { success, accountEmail } = await this.authService.verifyEmail(token);
            if (success) {
                try {
                    await this.authService.createOrAssociateProfile(accountEmail);
                    return response.status(200).json({ message: "Verified!" });
                } catch (err) {
                    return handleErrorResponse(response, err);
                }
            } else {
                return response.status(500).json({ message: "Failed to verify" });
            }
        } catch (err) {
            return handleErrorResponse(response, err);
        }
    }

    public async refreshToken(request: Request, response: Response) {
        try {
            const token = request.cookies.refreshToken;
            const ipAddress = request.ip;
            const { refreshToken, ...account } = await this.authService.refreshToken(token, ipAddress);
            this.setTokenCookie(response, refreshToken);
            return response.json(account);
        } catch (err) {
            return handleErrorResponse(response, err);
        }
    }

    public async revokeToken(request: Request, response: Response, next: NextFunction) {
        // "log out"
        try {
            // accept token from request body or cookie
            const token = request.body.token || request.cookies.refreshToken;
            const ipAddress = request.ip;
            if (request.user === undefined) {
                return handleErrorResponse(response, "User is required");
            }
            if (!token) return handleErrorResponse(response, "Token is required");
            // users can revoke their own tokens and admins can revoke any tokens
            const userOwnsToken = await this.authService.userOwnsToken(request.user.acctId, token);
            if (!userOwnsToken && request.user.role !== Role.Admin) {
                return response.status(401).json({ message: "Unauthorized" });
            }
            await this.authService.revokeToken(token, ipAddress);
            return response.json({ message: "Token revoked" });
        } catch (err) {
            return handleErrorResponse(response, err);
        }
    }

    public async bypassEmail(request: Request, response: Response) {
        try {
            const email = request.body.email;
            await this.authService.logVerificationToken(email);
            return response.status(200).json({ message: "success" });
        } catch (err) {
            return handleErrorResponse(response, err);
        }
    }

    public async updatePassword(request: Request, response: Response) {
        try {
            // include email, because if we didn't, then any logged in user could
            // try to change another logged in user's pw!
            const email = request.body.email;
            const oldPw = request.body.oldPw;
            const newPw = request.body.newPw;
            const confirmNewPw = request.body.confirmNewPw;
            if (newPw === undefined || confirmNewPw === undefined) return response.json({ error: "A password was missing" });
            if (newPw !== confirmNewPw) return response.json({ error: "Passwords did not match" });
            const success: boolean = await this.authService.updatePassword(email, oldPw, newPw);
            if (success) return response.json({ message: "Password updated!" });
            else return response.json({ error: "You entered the wrong starting password" });
        } catch (err) {
            return handleErrorResponse(response, err);
        }
    }

    // part of a 3 step(?) flow. forgotPw => validateResetToken => resetPw
    public async forgotPassword(request: Request, response: Response) {
        try {
            const email = request.body.email;
            // const origin = request.get("origin");
            // if (origin === undefined) {
            //     return handleErrorResponse(response, "Origin is required and was undefined");
            // }
            await this.authService.forgotPassword(email);
            return response.json({ message: "Please check your email for password reset instructions" });
        } catch (err) {
            return handleErrorResponse(response, err);
        }
    }

    public async validateResetToken(request: Request, response: Response) {
        try {
            const token = request.body.token;
            const success = await this.authService.validateResetToken(token);
            if (success) return response.json({ message: "Token is valid" });
            else return response.json({ message: "Invalid token" });
        } catch (err) {
            return handleErrorResponse(response, err);
        }
    }

    public async resetPassword(request: Request, response: Response) {
        try {
            const token = request.body.token;
            const password = request.body.password;
            const confirmed = request.body.confirmPassword;
            if (confirmed !== password) return response.status(400).json({ message: "Passwords don't match" });
            const success = await this.authService.resetPassword(token, password);
            if (success) return response.json({ message: "Password reset successful, you can now login" });
            else return response.json({ message: "Reset password failed" });
        } catch (err) {
            return handleErrorResponse(response, err);
        }
    }

    public async getRemainingCredits(request: Request, response: Response) {
        try {
            if (request.user === undefined) return handleErrorResponse(response, "User missing");
            const acctId = request.user.acctId;

            const remainingCredits = await this.authService.getRemainingCredits(acctId);
            return response.status(200).json({ remainingCredits });
        } catch (err) {
            return handleErrorResponse(response, err);
        }
    }

    public async getFreeCredits(request: Request, response: Response) {
        try {
            if (request.user === undefined) return handleErrorResponse(response, "User missing");
            const acctId = request.user.acctId;

            const newCreditsAmount = await this.authService.addFreeCredits(acctId);
            return response.status(200).json({ newCreditsAmount });
        } catch (err) {
            return handleErrorResponse(response, err);
        }
    }

    // **
    // authorized routes
    // **
    public async getAllAccounts(request: Request, response: Response) {
        try {
            const accounts = await this.authService.getAllAccounts();
            return response.json(accounts);
        } catch (err) {
            return handleErrorResponse(response, err);
        }
    }

    public async getAccountById(request: Request, response: Response) {
        try {
            const requestedAcctId = request.body.acctId;
            if (requestedAcctId !== request.user?.acctId && request.user?.role !== Role.Admin) {
                return response.status(401).json({ message: "Unauthorized" });
            }
            const idAsNumber = parseInt(requestedAcctId, 10);

            const account = await this.authService.getAccountById(idAsNumber);
            return account ? response.json(account) : response.sendStatus(404);
        } catch (err) {
            return handleErrorResponse(response, err);
        }
    }

    public async createAccount(request: Request, response: Response) {
        try {
            const account = this.authService.createAccount(request.body);
            return response.json(account);
        } catch (err) {
            return handleErrorResponse(response, err);
        }
    }

    public async updateAccount(request: Request, response: Response) {
        try {
            // users can update their own account and admins can update any account
            const idOfAcctToUpdate = request.body.acctId;
            if (idOfAcctToUpdate !== request.user?.acctId && request.user?.role !== Role.Admin) {
                return response.status(401).json({ message: "Unauthorized" });
            }
            const idAsNumber = parseInt(idOfAcctToUpdate, 10);

            const account = this.authService.updateAccount(idAsNumber, request.body);
            return response.json(account);
        } catch (err) {
            return handleErrorResponse(response, err);
        }
    }

    public async _deleteAccount(request: Request, response: Response) {
        try {
            // users can delete their own account and admins can delete any account
            const idOfAcctToDelete = request.body.acctId;
            if (request.user === undefined) return handleErrorResponse(response, "User missing");
            if (idOfAcctToDelete !== request.user?.acctId && request.user?.role !== Role.Admin) {
                return response.status(401).json({ message: "Unauthorized" });
            }

            await this.authService.deleteAccount(request.params.id);
            return response.json({ message: "Account deleted successfully" });
        } catch (err) {
            return handleErrorResponse(response, err);
        }
    }

    public async healthCheck(request: Request, response: Response) {
        return response.json({ message: "ok" });
    }

    private setTokenCookie(response: Response, token: string) {
        // create cookie with refresh token that expires in 7 days
        const cookieOptions = {
            httpOnly: true,
            expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            sameSite: "none" as const,
            secure: true,
        };
        response.cookie("refreshToken", token, cookieOptions);
    }
}

export default AuthController;
