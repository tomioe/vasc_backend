"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const body_parser_1 = __importDefault(require("body-parser"));
const crypto_1 = __importDefault(require("crypto"));
const cors_1 = __importDefault(require("cors"));
const path_1 = __importDefault(require("path"));
const util_1 = __importDefault(require("util"));
const app = express_1.default();
app.use(body_parser_1.default.json());
app.use(body_parser_1.default.urlencoded({ extended: true }));
app.use(cors_1.default());
const port = "4000";
const BACKEND_BASE = "/dev/vasc/backend";
const DB_PATH = path_1.default.join(BACKEND_BASE, "DB");
const db_interface = require(path_1.default.join(DB_PATH, "db_interface"));
// Search for a product, with a URL parameter of ?q=
app.get("/search", (req, res) => {
    let urlQuery = req.query.q;
    if (urlQuery) {
        db_interface
            .search(urlQuery, true)
            .then((items) => {
            util_1.default.inspect(items);
            res.json(items);
        })
            .catch((e) => {
            console.error(e);
            res.status(500).send("Database error during search!");
        });
    }
    else {
        res.status(404).send("Invalid search query.");
    }
});
// Serve product information
app.get("/product/:id", (req, res) => {
    if (req.params.id) {
        db_interface
            .search(req.params.id, false)
            .then((items) => {
            res.json(items);
        })
            .catch((err) => {
            console.error(err);
            res.status(500).send("Database error during product lookup!");
        });
    }
    else {
        res.status(404).send("Invalid product query.");
    }
});
//Catches requests made to / [root]
app.get("/", (req, res) => {
    const hashFunction = crypto_1.default.createHash("sha256");
    hashFunction.update(new String(new Date().getTime()).concat(port));
    res.send(hashFunction.digest("hex"));
});
// Start the Express server and open database connection.
app.listen(port, () => {
    db_interface.open();
    console.log(`[API] Vape Scrape API listening on port ${port}!`);
});
//# sourceMappingURL=server.js.map