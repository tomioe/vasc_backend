const express =  require("express");


const bodyParser =  require("body-parser");
const serverCrypto =  require("crypto");
const Buffer = require('safe-buffer').Buffer
const sharp = require('sharp')
const cors =  require("cors");
const path =  require("path");


const fs = require("fs");


const util = require("util");

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors());

const port = process.env.PORT || "4000";

const BACKEND_BASE = "./"
const db_interface = require("./_db/db_interface")

// Search for a product, with a URL parameter of ?q=
app.get("/search", (req, res) => {
    let urlQuery = req.query.q;
    if(urlQuery) {
        db_interface
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

// Serve product information
app.get("/product/:id", (req, res) => {
    if(req.params.id) {
        db_interface
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

// Catches requests made to /image/[fileName]?w=[width]
app.get("/image/:imageName", (req, res) => {
    const imageName = req.params.imageName;
    let width = req.query.w;
    if(imageName) {
        const imagePath = "./_store/";
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

// we use this url when we want to track the user going to a vendor's page
// initially we want to log this:
//      /click?url=[base64(url)]
// later, we should include things like client-browser, width/height, etc. from client page.
// we can encode this JSON object in base64 as well
app.get("/click", (req, res) => {
    //console.log("[API] Tracking started.")

    // step 0: decode the URL
    //console.log("[API] Decoding URL...")
    const urlBase64 = req.query["url"];
    if(urlBase64 === "") {
        //console.log("[API] Passed URL was empty, returning!")
        return;
    }
    const urlBuffer = new Buffer(urlBase64, 'base64');
    const urlDecoded = urlBuffer.toString();

    //console.log("[API] Extracting IP...")
    // step 1: extract information about the request [ip]
    const ip_addr = req.headers['x-forwarded-for'] ? req.headers['x-forwarded-for'].split(',')[0] : req.socket.remoteAddress; // https://stackoverflow.com/posts/23835670/revisions
    const requestUserInformation = {
        "ip_addr": ip_addr,
        "time": new Date()
    }
    //console.log("[API] Done:")
    console.log(requestUserInformation)

    // step 2: async entry into DB, with additional info (datetime + geoloc[?]) [https://rapidapi.com/blog/geolocation-backend-node-express/]
    console.log("[API] URL Decoded, IP address extracted, Entering information into database...")
    const enterTrackData = async (addressToTrack,userInformation) => {
        await console.log(requestUserInformation)
        await console.log("[API] Information entered successfully!")
    };
    enterTrackData();

    // step 3: redirect to the url
    console.log("[API] Redirecting to requested page.")
    res.redirect(urlDecoded);
})

//Catches requests made to / [root]
app.get("/", (req, res) => {
	const hashFunction = serverCrypto.createHash("sha256");
	hashFunction.update(new String(new Date().getTime()).concat(port));
	res.send(hashFunction.digest("hex"));
});

// Start the Express server and open database connection.
app.listen(port, () => {
    db_interface.open();
    console.log(`[API] Vape Scrape API listening on port ${port}!`)
});
