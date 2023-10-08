import { Client } from "pg";
import { Router } from "express";

import { HTTPResponse } from "./Utils";
import { User } from "./User";

const DB = new Client();
DB.connect();

const API = Router();

// User
API.get('/user/:id', (req, res, next) => {
    
});

API.post('/user/create', async (req, res, next) => {
    let result = await User.FormValidation(req.body);
    if(result instanceof User) {

    } else {
        return res.status(result.code).json(result);
    }
});

export { API };