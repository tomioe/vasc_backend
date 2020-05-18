import  { Request, Response } from "express";
import express from "express";

import bodyParser from "body-parser";
import serverCrypto from "crypto";
import cors from "cors";
import path from "path";



const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors());

const port: string = "4000";


const BACKEND_BASE = "/dev/vasc/backend"
const DB_PATH = path.join(BACKEND_BASE, "DB")
const db_interface = require(path.join(DB_PATH, "db_interface"))

// Search for a product, with a URL parameter of ?q=
app.get("/search", (req, res) => {
    let urlQuery = req.query.q;
    if(urlQuery) {
        db_interface
            .search(urlQuery, true)
            .then((items: String[]) => {
                res.json(items);
            })
            .catch((e: Error) => {
                console.error(e);
                res.status(500).send("Database error during search!");
            });
    } else {
        res.status(404).send("Invalid search query.");
    }
});

// Serve product information
app.get("/product/:id", (req, res) => {
    if(req.params.id) {
        db_interface
            .search(req.params.id, false)
            .then((items: String[]) => {
                res.json(items);
            })
            .catch((err: Error) => {
                console.error(err);
                res.status(500).send("Database error during product lookup!");
            });
    } else {
        res.status(404).send("Invalid product query.");
    }
});

//Catches requests made to / [root]
app.get("/", (req, res) => {
	const hashFunction = serverCrypto.createHash("sha256")
	hashFunction.update(new String(new Date().getTime()).concat(port));
	res.send(hashFunction.digest("hex"));
});

// Start the Express server and open database connection.
app.listen(port, () => {
    db_interface.open();
    console.log(`[API] Vape Scrape API listening on port ${port}!`)
});
