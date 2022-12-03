import { Cache } from "joi";
import GymDAO from "../database/dao/gym.dao";
import HousingDAO from "../database/dao/housing.dao";
import { Housing } from "../database/models/Housing";
import { MAX_ACCEPTABLE_LATITUDE_DIFFERENCE, MAX_ACCEPTABLE_LONGITUDE_DIFFERENCE } from "../util/acceptableRadiusForWalking";
import CacheService from "./cache.service";

class HousingService {
    private cacheService: CacheService;
    private housingDAO: HousingDAO;
    private gymDAO: GymDAO;

    constructor(housingDAO: HousingDAO, gymDAO: GymDAO, cacheService: CacheService) {
        this.housingDAO = housingDAO;
        this.gymDAO = gymDAO;
        this.cacheService = cacheService;
    }

    //
    public async getAllHousing(cityId?: number, cityName?: string, stateOrProvince?: string): Promise<Housing[]> {
        return await this.housingDAO.getAllHousing(cityId, cityName, stateOrProvince);
    }

    public async getHousingByCityIdAndBatchNum(cityId: number, batchNum: number): Promise<Housing[]> {
        return await this.housingDAO.getHousingByCityIdAndBatchNum(cityId, batchNum);
    }

    public async getApartmentsByLocation(cityName: string | undefined): Promise<Housing[]> {
        return await this.housingDAO.getApartmentsByLocation(cityName);
    }

    // step 4 of scraping process
    public async qualifyScrapedApartments(cityName: string) {
        const relevantCityId = await this.cacheService.getCityId(cityName);
        const gymsFromDb = await this.gymDAO.getMultipleGyms(cityName);
        const gyms = gymsFromDb.rows;
        const affectedCount = {
            qualified: 0,
            total: 0,
        };
        for (const gym of gyms) {
            const upperLimitLatitude = gym.lat + MAX_ACCEPTABLE_LATITUDE_DIFFERENCE;
            const lowerLimitLatitude = gym.lat - MAX_ACCEPTABLE_LATITUDE_DIFFERENCE;
            const upperLimitLongitude = gym.long + MAX_ACCEPTABLE_LONGITUDE_DIFFERENCE;
            const lowerLimitLongitude = gym.long - MAX_ACCEPTABLE_LONGITUDE_DIFFERENCE;
            const affectedHousings = await this.housingDAO.markQualified(
                relevantCityId,
                upperLimitLatitude,
                lowerLimitLatitude,
                upperLimitLongitude,
                lowerLimitLongitude,
            );
            console.log(affectedHousings, "53rm");
            affectedCount.qualified = affectedCount.qualified + affectedHousings[0];
        }
        const totalHousings = await this.housingDAO.countHousingsInCity(relevantCityId);
        affectedCount.total = totalHousings;
        return affectedCount;
    }

    // step 5 of scraping process
    public async deleteUnqualifiedApartments(cityName: string) {
        const relevantCityId = await this.cacheService.getCityId(cityName);
        const deletedHousings = await this.housingDAO.deleteHousingByHousingId(relevantCityId);
        return deletedHousings;
    }

    public async deleteAllHousing() {
        const affected = await this.housingDAO.deleteAllHousing();
        return affected;
    }
}

export default HousingService;
