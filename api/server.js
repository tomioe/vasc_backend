const express = require("express");
const bodyParser = require("body-parser");
var cors = require('cors');

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors());

const port = 4000;

const db_handler = require("../db/db_handler")

// Search for a product, with a
app.get('/search', (req, res) => {
    let urlQuery = req.query.q;
    if(urlQuery) {
        db_handler
        .search(urlQuery)
        .then(items => {
            //console.log(util.inspect(items));
            res.json(items);
        })
        .catch(e => {
            console.error(e);
            res.status(500).send("Database error!");
        });
    } else {
        res.status(400).send("Invalid query.");
    }
});

// Serve product information
app.get('/product/:id', (req, res) => {
    res.status(501).send("TBD.");
});

//Catches requests made to localhost:3000/
app.get('/', (req, res) => res.send("Hello API!"));

//Initialises the express server on the port 30000
app.listen(port, () => {
    db_handler.start();
    console.log(`[API] Example app listening on port ${port}!`)
});
