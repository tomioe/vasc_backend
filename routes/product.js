var express = require('express');
var router = express.Router();

// Serve product information
router.get("/product/:id", (req, res) => {
    if(req.params.id) {
        req.db_interface
            .search(req.params.id, false)
            .then(items => {
                res.json(items);
            })
            .catch(err => {
                console.error(err);
                res.status(500).send("Database error during product lookup!");
            });
    } else {
        res.status(404).send("Invalid product query.");
    }
});


module.exports = router;