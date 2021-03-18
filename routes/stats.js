const express = require("express");
const router = express.Router();

var util = require('util');


// We use this url when we meed to return DB stats 
router.get("/stats/:type", (req, res) => {
    const statType = req.params.type
    if(!statType || statType === "") {
        console.log("[Stats] No stat type given.");
        res.status(400).send("Invalid stats query.");
        return;
    }

    if(statType == "users") {
        req.db_interface
            .statsUsers()
            .then( (result) => {
                // console.log(util.inspect(result))
                res.json(result)
            })
            .catch( (e) => {
                console.error(e);
                res.status(500);
                res.end("Database error!")
            })

    }
})

module.exports = router;