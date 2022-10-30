import { cookie } from "express-validator";
import request from "supertest";
import AccountDAO from "../../src/database/dao/account.dao";
import ResetTokenDAO from "../../src/database/dao/resetToken.dao";

import { app, server } from "../mocks/mockServer";
import { emails, passwords, badPasswords, tooShortPassword } from "../mocks/userCredentials";

const path = "/auth";

let TOKEN_COOKIES = "";
let ACCESS_TOKEN = "";

const validCredentials = {
    email: emails[0],
    password: passwords[0],
    confirmPassword: passwords[0],
    acceptTerms: true,
};

const invalidCredentials1 = {
    email: emails[0],
    password: passwords[0],
    confirmPassword: passwords[0],
    acceptTerms: false, // false is a problem
};

const invalidCredentials2 = {
    email: emails[0],
    password: passwords[0],
    confirmPassword: passwords[1], // if pw no match, problem!
    acceptTerms: true,
};

const invalidCredentials3 = {
    email: "notAnEmail",
    password: passwords[1],
    confirmPassword: passwords[1],
    acceptTerms: true,
};

let acctDAO: AccountDAO = new AccountDAO();
let resetTokenDAO: ResetTokenDAO = new ResetTokenDAO(acctDAO);

beforeAll(async () => {
    console.log("\n====\n====\nstarting app...\n===\n===");
    await app.connectDB();
    await app.dropTable("account");
    // await app.dropTable("resetToken");
});

afterAll(async () => {
    console.log("***\n***\n***\nclosing app...");
    await app.closeDB();
});

function logTime(a: number) {
    var d = new Date(); // for now
    console.log(
        a.toString() +
            " - " +
            d.getHours() +
            ":" + // => 9
            d.getMinutes() +
            ":" + // =>  30
            d.getSeconds(),
    ); // => 51
}

describe("Test auth controller", () => {
    // describe("health check", () => {
    //     test("is active", async () => {
    //         const p = `${path}/health`;
    //         const res = await request(server).get(p);
    //         expect(res.body.message).toBe("ok");
    //     });
    // });
    describe("POST /register", () => {
        test("responds with success msg if body is populated properly", async () => {
            const res = await request(server).post(`${path}/register`).set("origin", "testSuite").send(validCredentials);
            expect(res.body.message).toBe("Registration successful, please check your email for verification instructions");
            expect(res.body.accountDetails.email).toBe(validCredentials.email);
            expect(res.body.accountDetails.isVerified).toBe(null);
        });
        test("rejects for malformed inputs and edge cases", async () => {
            await request(server).post(`${path}/register`).expect(400);
            await request(server).post(`${path}/register`).send(invalidCredentials1).expect(400);
            await request(server).post(`${path}/register`).send(invalidCredentials2).expect(400);
            await request(server).post(`${path}/register`).send(invalidCredentials3).expect(400);
        });
    });
    describe("POST /authenticate", () => {
        // authentic
        test("responds with success msg if body is populated properly", () => {
            //
        });
        test("malformed and edge cases are rejected", () => {
            //
        });
    });
    describe("Complete user registration flow & password reset", () => {
        test("works - integration - register => verify email => authenticate => change pw => login again", async () => {
            const credentials = { ...validCredentials };
            credentials.email = "foobarbazgirl@gmail.com";
            const pw = "catsDOGS444%%";
            credentials.password = pw;
            credentials.confirmPassword = pw;
            const res = await request(server).post(`${path}/register`).set("origin", "testSuite").send(credentials);
            expect(res.body.message).toBe("Registration successful, please check your email for verification instructions");
            expect(res.body.accountDetails.email).toBe(credentials.email);
            expect(res.body.accountDetails.isVerified).toBe(null);
            // get token via cheater method b/c we don't have email set up => verify ownership of account
            const madeAcct = await acctDAO.getAccountByEmail(credentials.email);
            const token = madeAcct[0].verificationToken;
            const payload = { token: token };
            const acctVerificationRes = await request(server).post(`${path}/verify_email`).send(payload);
            expect(acctVerificationRes.body.message).toBe("Verification successful, you can now login");
            // now we expect logging in with this new account to "just work"
            const loginPayload = { email: credentials.email, password: pw };
            const authenticationRes = await request(server).post(`${path}/authenticate`).send(loginPayload);
            expect(authenticationRes.body.email).toBe(credentials.email);
            expect(authenticationRes.body.acctId).toBeDefined();
            expect(authenticationRes.body.isVerified).toBe(true); // the goods! verification successful.
            // check header for jwt and refresh token
            const jwtToken = authenticationRes.body.jwtToken;
            expect(jwtToken).toBeDefined();
            expect(jwtToken.length).toBe(153);
            const refreshToken = authenticationRes.headers["set-cookie"][0];
            const refreshTokenString = refreshToken.split(";")[0].split("=")[1];
            expect(refreshTokenString).toBeDefined();
            expect(refreshTokenString.length).toBe(80);
            // now try changing the password
            const newPw = pw + "str";
            const emailChangerPayload = {
                email: credentials.email,
                oldPw: pw,
                newPw: newPw,
                confirmNewPw: newPw,
            };
            const changedPwRes = await request(server)
                .post(`${path}/update_password`)
                .set("Authorization", "bearer " + jwtToken)
                .send(emailChangerPayload);
            expect(changedPwRes.body.message).toBe("Password updated!");
            // can now log in with new credentials
            const loginPayload2 = { email: emailChangerPayload.email, password: emailChangerPayload.newPw };
            const authenticationRes2 = await request(server).post(`${path}/authenticate`).send(loginPayload2);
            // redo check authentication response
            expect(authenticationRes2.body.email).toBe(loginPayload2.email);
            expect(authenticationRes2.body.acctId).toBeDefined();
            expect(authenticationRes2.body.isVerified).toBe(true); // the goods! verification successful.
            // check header for jwt and refresh token
            const jwtToken2 = authenticationRes2.body.jwtToken;
            expect(jwtToken2.length).toBe(153);
            const refreshToken2 = authenticationRes2.headers["set-cookie"][0];
            const refreshTokenString2 = refreshToken2.split(";")[0].split("=")[1];
            expect(refreshTokenString2).toBeDefined();
            expect(refreshTokenString2.length).toBe(80);
            // ** amazing! **
        });
        test("works - integration - create account => verify => forget pw => validate reset token => reset pw => login", async () => {
            // Setup
            const credentials3 = {
                email: "foobarbazman@gmail.com",
                pw: "catsDOGS444%%",
                password: "jlg900#A",
                confirmPassword: "jlg900#A",
                acceptTerms: true,
            };
            const res = await request(server).post(`${path}/register`).set("origin", "testSuite").send(credentials3);
            console.log("170rm");
            expect(res.body.message).toBe("Registration successful, please check your email for verification instructions");
            expect(res.body.accountDetails.email).toBe(credentials3.email);
            expect(res.body.accountDetails.isVerified).toBe(null);
            // get token via cheater method b/c we don't have email set up => verify ownership of account
            const madeAcct = await acctDAO.getAccountByEmail(credentials3.email);
            const token = madeAcct[0].verificationToken;
            const payload = { token: token };
            console.log("177rm");
            const acctVerificationRes = await request(server).post(`${path}/verify_email`).send(payload);
            expect(acctVerificationRes.body.message).toBe("Verification successful, you can now login");
            // The real reason the test is here
            const forgotPwPayload = {
                email: credentials3.email,
            };
            console.log("183rm");
            const forgotPwRes = await request(server).post(`${path}/forgot_password`).set("origin", "testSuite").send(forgotPwPayload);
            expect(forgotPwRes.body.message).toBe("Please check your email for password reset instructions");
            // bypass email, get token directly
            const forgotPwToken = await resetTokenDAO.getResetTokenByEmail(forgotPwPayload.email);
            const t = { token: forgotPwToken?.token };
            console.log("191rm");
            const validateTokenRes = await request(server).post(`${path}/validate_reset_token`).send(t);
            expect(validateTokenRes.body.message).toBe("Token is valid");
            const newPwPayload = { ...t, password: "someNewPw99##", confirmPassword: "someNewPw99##" };
            const resetPwRes = await request(server).post(`${path}/reset_password`).send(newPwPayload);
            expect(resetPwRes.body.message).toBe("Password reset successful, you can now login");
        }, 100000);
    });
});
