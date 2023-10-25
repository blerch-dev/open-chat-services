import { Client } from "pg";
import { Router } from "express";

import { HTTPResponse } from ".";
import { User } from "../Models/User";

// const DB = new Client();
// DB.connect();

const DB: {[key: string]: any} = {};

const API = Router();

// #region User
API.get('/user/:id', (req, res, next) => {
    
});

API.post('/user/create', async (req, res, next) => {
    let result = await User.FormValidation(req.body);
    if(result instanceof User) {
        console.log("Created User:", result.toJSON());
        DB[result.getID()] = result;
        // create user
        // set session
    } else {
        return res.status(result.code).json(result);
    }
});
// #endregion

export { API };