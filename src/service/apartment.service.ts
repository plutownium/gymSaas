import express from "express";
// https://medium.com/swlh/how-to-implement-google-places-api-in-your-application-js-express-node-js-97b16da24835
// const dotenv = require("dotenv").config();
import dotenv from "dotenv";

import fs from "fs";
import path from "path";

import axios from "axios";

import { IHousing } from "../interface/Housing.interface";
import Parser from "../util/parser";
import { ProviderEnum } from "../enum/provider.enum";
import Scraper from "../scrapers/scraper";
import ScraperFactory from "../scrapers/factory";
import { detectViewportSize } from "../util/viewportSizeDetector";
import { IBounds } from "../interface/Bounds.interface";
import LocationDiscoveryService from "./locationDiscovery.service";
import { ILatLong } from "../interface/LatLong.interface";
import { generateGrid } from "../util/gridMaker";

const rc = require("../../hardcodeReplies/rentCanada.json");
const rf = require("../../hardcodeReplies/rentFaster.json");
const rs = require("../../hardcodeReplies/rentSeeker.json");

// const dotenvConfig = dotenv.config();
dotenv.config();

class ApartmentScraperService {
    constructor() {}

    public async scrapeApartments(provider: ProviderEnum, city: string, stateOrProvince: string, country: string): Promise<IHousing[]> {
        // fwd request to Flask scraper services.
        // Note: Expect scraping to take 5-10 minutes in the future, when we have 4 scrapers handling 1 to 100 screens worth of data.

        return [];
    }

    public async detectProviderViewportWidth(provider: ProviderEnum, city: string, stateOrProvince: string, country: string): Promise<IBounds> {
        // step 1: discover the viewport width. To be used in the grid maker as "jump" size.
        const scraper = new ScraperFactory().createScraperOfType(provider);
        if (country !== "Canada" && country !== "canada") {
            throw new Error("Invalid country");
        }
        const locationDiscovery = new LocationDiscoveryService();
        const coords = await locationDiscovery.geocoding("", city, stateOrProvince, country);
        const results = await scraper.scrape(coords.lat, coords.long, provider);
        const dimensions = detectViewportSize(results);
        return dimensions;
        // todo: put detected width into db so dont have to keep redoing this. something like a "viewportWidth" model
    }

    public async planGrid(startCoords: ILatLong, bounds: IBounds, radius: number): Promise<ILatLong[]> {
        // step 2 of 3: plan the grid pattern the apis will scan in.
        const theSmallerOfTheTwo = bounds.kmEastWest > bounds.kmNorthSouth ? bounds.kmNorthSouth : bounds.kmEastWest;
        // choose the smaller of the two distances because we prefer some overlap instead of some space between snapshots
        const subdivisionLocations: ILatLong[] = generateGrid(startCoords, theSmallerOfTheTwo, radius);
        // todo: retrieve stored grid dimensions if they exist.
        return subdivisionLocations;
    }

    public async getDummyData(provider: ProviderEnum): Promise<IHousing[]> {
        // open data based on input string
        const parser = new Parser(provider);
        console.log(__dirname, "31rm");
        if (provider === ProviderEnum.rentCanada) {
            return parser.parse(rc);
        } else if (provider === ProviderEnum.rentFaster) {
            return parser.parse(rf);
        } else if (provider === ProviderEnum.rentSeeker) {
            return parser.parse(rs);
        } else {
            throw new Error("Provider not included or invalid");
        }
    }
}

export default ApartmentScraperService;
