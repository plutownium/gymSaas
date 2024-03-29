import Joi, { ObjectSchema } from "joi";
import { NextFunction, Request, Response } from "express";

import validateRequest from "../middleware/validateRequest.middleware";

export function feedbackSchema(req: Request, res: Response, next: NextFunction) {
    const schema: ObjectSchema = Joi.object({
        questionOneAnswer: Joi.number(),
        questionTwoAnswer: Joi.number(),
        questionThreeAnswer: Joi.number(),
        largeTextAnswer: Joi.string(),
    });
    validateRequest(req, next, schema);
}

export function featureRequestSchema(req: Request, res: Response, next: NextFunction) {
    const schema: ObjectSchema = Joi.object({
        featureReqOneAnswer: Joi.string(),
        featureReqTwoAnswer: Joi.string(),
    });
    validateRequest(req, next, schema);
}
