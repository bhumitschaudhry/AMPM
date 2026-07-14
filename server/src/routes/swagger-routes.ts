import { Router } from "express";
import swaggerUi from "swagger-ui-express";
import { swaggerSpec } from "./swagger-spec";

export const swaggerRouter = Router();

swaggerRouter.use(swaggerUi.serve);
swaggerRouter.get("/", swaggerUi.setup(swaggerSpec));
