var express = require("express");
var router = express.Router();

const path =  require("path");
const fs = require("fs");

const sharp = require("sharp")


// Catches requests made to /image/[fileName]?w=[width]
router.get("/image/:imageName", (req, res) => {
    const imageName = req.params.imageName;
    let width = req.query.w;
    if(imageName) {
        // dev_env = "./_store/"
        // prod_env = "/app/_store/"
        const imagePath = (process.env.NODE_ENV==="production" ? "/app/" : "./") + "_store/";

        const fullImagePath = path.join(imagePath, imageName);
        if(fs.existsSync(fullImagePath)) {
            if(width) {
                try {
                    width = parseInt(width);
                    if(width <= 0) {
                        width = 1;
                    }
                    sharp(fullImagePath).resize(width).pipe(res);
                } catch (error) {
                    console.log("[API] Request for image with invalid width.")
                    res.send("Invalid width.");
                }
            } else {
                res.sendFile(imageName, {root:imagePath});
            }
        } else {
            console.log("[API] Request for non-existent image [filepath="+fullImagePath+"].")
            res.send("404");
        }
    } else {
        res.status(404).send("Invalid image query.");
    }
});

module.exports = router;
