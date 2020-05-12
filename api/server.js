const express = require("express");
const crypto = require('crypto')
const cors = require('cors');
const bodyParser = require("body-parser");



const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors());

const port = 4000;

const db_interface = require("../db/db_interface")

// Search for a product, with a URL parameter of ?q=
app.get('/search', (req, res) => {
    let urlQuery = req.query.q;
    if(urlQuery) {
        db_interface
        .search(urlQuery, true)
        .then(items => {
            //console.log(util.inspect(items));
            res.json(items);
        })
        .catch(e => {
            console.error(e);
            res.status(500).send("Database error during search!");
        });
    } else {
        res.status(404).send("Invalid search query.");
    }
});

// Serve product information
app.get('/product/:id', (req, res) => {
    if(req.params.id) {
        db_interface
            .search(req.params.id, false)
            .then(items => {
                res.json(items);
            })
            .catch(e => {
                console.error(e);
                res.status(500).send("Database error during product lookup!");
            });
    } else {
        res.status(404).send("Invalid product query.");
    }
});

//Catches requests made to / [root]
app.get('/', (req, res) => {
	const hashFunction = crypto.createHash('sha256')
	hashFunction.update(new String(new Date().getTime()) + new String(port));
	res.send(hashFunction.digest("hex"));
});

// Start the Express server and open database connection.
app.listen(port, () => {
    db_interface.open();
    console.log(`[API] Example app listening on port ${port}!`)
});
