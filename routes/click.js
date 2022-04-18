const express = require("express");
const router = express.Router();

const saferBuffer = require("safer-buffer").Buffer
const unirest = require("unirest");

var ipformat = /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/

let getGeoLoc = (ipAddress) => {
    return new Promise( (resolve, reject) => {
        let ipReg = ipAddress.match(ipformat)[0];
        if(ipReg === "127.0.0.11") {
            console.log(`[API] GeoLoc on localhost, aborting.`);
            reject();
        } else {
            let req = unirest("GET", `https://ip-geo-location.p.rapidapi.com/ip/${ipReg}`);
            req.query({
                "format": "json"
            });

            req.headers({
                "x-rapidapi-key": "",
                "x-rapidapi-host": "ip-geo-location.p.rapidapi.com",
                "useQueryString": true
            });
            req.end(function(result) {
                if (result.error) reject(result.error);
                console.log(result.body)
                resolve(result.body);
            });
        }
    })
}

// We use this url when we want to track the user going to a vendor"s page
router.get("/click", (req, res) => {
    //console.log("[API] Tracking started.")

    // step 0: decode the URL
    //console.log("[API] Decoding URL...")
    const urlBase64 = req.query["url"];
    if(urlBase64 === "") {
        //console.log("[API] Passed URL was empty, returning!")
        return;
    }
    const urlBuffer = saferBuffer.from(urlBase64, "base64");
    const urlDecoded = urlBuffer.toString();

    let clientDeviceData = null;
    const clientDeviceDataRaw = req.query["cdd"];
    if(clientDeviceDataRaw === "") {
        console.log("[API] No ClientDeviceData received...");
    } else {
        console.log("[API] Received ClientDeviceData!");
        const cddBuffer = saferBuffer.from(clientDeviceDataRaw, "base64");
        const cddDecoded = cddBuffer.toString();
        clientDeviceData = JSON.parse(cddDecoded);
        //console.log(clientDeviceData)
    }

    //console.log("[API] Extracting IP...")
    // step 1: extract information about the request [ip] and prepare data entry
    const ip_addr = req.headers["x-forwarded-for"] ? req.headers["x-forwarded-for"].split(",")[0] : req.socket.remoteAddress; // https://stackoverflow.com/posts/23835670/revisions
    const requestUserInformation = {
        "ipAddress": ip_addr,
        "date": new Date(),
        "site": urlDecoded,
        "deviceData": clientDeviceData
    }

    // step 2: async entry into DB (geoloc?) [https://rapidapi.com/blog/geolocation-backend-node-express/]
    console.log("[API] URL Decoded, IP address extracted, Entering information into database...")
    const enterTrackData = async (requestUserInformation) => {
        const geoLocData = await getGeoLoc(ip_addr).catch( (e) => { });
        if(geoLocData && geoLocData.location) {
            requestUserInformation["geoLocationData"] = geoLocData;
        }
        await req.db_interface.click(requestUserInformation);
        console.log(`[API] Done with DB click entry!`);
    };
    enterTrackData(requestUserInformation);

    // step 3: redirect to the url
    if(req.query["redirect"] && req.query["redirect"] === "false") {
        res.end();
    } else {
        console.log("[API] Redirecting to requested page.")
        res.redirect(urlDecoded);
    }
})

module.exports = router;
