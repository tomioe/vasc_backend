const express = require("express");

const bodyParser =  require("body-parser");
const cors =  require("cors");

const util = require("util");

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors());


const port = process.env.PORT || "4000";

const db_interface = require("./_db/db_interface")


const indexRoute = require("./routes/index");
app.get("/", indexRoute);

const imageRoute = require("./routes/image");
app.get("/image/:imageName", imageRoute);

const clickRoute = require("./routes/click");
app.get("/click", (req, res, next) => {
    req.db_interface = db_interface;
    next();
}, clickRoute);

const searchRoute = require("./routes/search");
app.get("/search", (req, res, next) => {
    req.db_interface = db_interface;
    next();
}, searchRoute);

const productRoute = require("./routes/product");
app.get("/product/:id", (req, res, next) => {
    req.db_interface = db_interface;
    next();
}, productRoute);

const statsRoute = require("./routes/stats");
app.get("/stats/:type", (req, res, next) => {
    req.db_interface = db_interface;
    next();
}, statsRoute);

// Start the Express server and open database connection.
app.listen(port, () => {
    db_interface.open();
    console.log(`[API] Vape Scrape API listening on port ${port}!`)
});
