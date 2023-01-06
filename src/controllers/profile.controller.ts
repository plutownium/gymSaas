import express, { Request, Response } from "express";

import { HealthCheck } from "../enum/healthCheck.enum";
import ProfileService from "../service/profile.service";
import { isString, isStringInteger } from "../validationSchemas/inputValidation";

class ProfileController {
    public path = "/profile";
    public router = express.Router();
    private profileService: ProfileService;

    constructor(profileService: ProfileService) {
        this.profileService = profileService;
        this.router.post("/pick-public/housing", this.recordPublicPickHousing.bind(this));
        this.router.post("/pick-public/gym", this.recordPublicPickGym.bind(this));
        this.router.get("/all/picks/housing", this.getAllHousingPicks.bind(this));
        this.router.get("/all/picks/housing/by-ip", this.getAllHousingPicksByIp.bind(this));
        this.router.get("/all/picks/gym", this.getAllGymPicks.bind(this));
        this.router.get("/all/picks/gym/by-ip", this.getAllGymPicksByIp.bind(this));
        this.router.get(HealthCheck.healthCheck, this.healthCheck.bind(this));
    }

    public async recordPublicPickHousing(request: Request, response: Response) {
        const ip = request.ip;
        const housingId = request.body.housingId;
        await this.profileService.recordPublicPickHousing(ip, housingId);
        return response.status(200).json({ message: "Success" });
    }

    public async recordPublicPickGym(request: Request, response: Response) {
        const ip = request.ip;
        const gymId = request.body.gymId;
        await this.profileService.recordPublicPickGym(ip, gymId);
        return response.status(200).json({ message: "Success" });
    }

    public async recordPickWithAuth(request: Request, response: Response) {
        //
        // const userId =
        // const housingId = request.body.housingId;
        return response.status(200).json();
    }

    public async getAllHousingPicks(request: Request, response: Response) {
        //
        const acctId = request.body.acctId;
        const housingPicks = await this.profileService.getAllHousingPicks(acctId);
        return response.status(200).json(housingPicks);
    }

    public async getAllHousingPicksByIp(request: Request, response: Response) {
        // probably useful only in testing.
        const ip = request.ip;
        const housingPicks = await this.profileService.getAllHousingPicksByIp(ip);
        return response.status(200).json(housingPicks);
    }

    public async getAllGymPicks(request: Request, response: Response) {
        const acctId = request.body.acctId;
        const gymPicks = await this.profileService.getAllGymPicks(acctId);
        return response.status(200).json(gymPicks);
    }

    public async getAllGymPicksByIp(request: Request, response: Response) {
        // probably useful only in testing.
        const ip = request.ip;
        const gymPicks = await this.profileService.getAllGymPicksByIp(ip);
        return response.status(200).json(gymPicks);
    }

    async healthCheck(request: Request, response: Response) {
        return response.status(200).json({ status: "Online" });
    }
}

export default ProfileController;