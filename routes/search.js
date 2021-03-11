var express = require('express');
var router = express.Router();

// Search for a product, with a URL parameter of ?q=
router.get("/search", (req, res) => {
    let urlQuery = req.query.q;
    if(urlQuery) {
        req.db_interface
            .search(urlQuery, true)
            .then(items => {
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

module.exports = router;