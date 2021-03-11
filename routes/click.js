var express = require('express');
var router = express.Router();

const saferBuffer = require('safer-buffer').Buffer

// we use this url when we want to track the user going to a vendor's page
// initially we want to log this:
//      /click?url=[base64(url)]
// later, we should include things like client-browser, width/height, etc. from client page.
// we can encode this JSON object in base64 as well
router.get("/click", (req, res) => {
    //console.log("[API] Tracking started.")

    // step 0: decode the URL
    //console.log("[API] Decoding URL...")
    const urlBase64 = req.query["url"];
    if(urlBase64 === "") {
        //console.log("[API] Passed URL was empty, returning!")
        return;
    }
    const urlBuffer = saferBuffer.from(urlBase64, 'base64');
    const urlDecoded = urlBuffer.toString();

    //console.log("[API] Extracting IP...")
    // step 1: extract information about the request [ip]
    const ip_addr = req.headers['x-forwarded-for'] ? req.headers['x-forwarded-for'].split(',')[0] : req.socket.remoteAddress; // https://stackoverflow.com/posts/23835670/revisions
    const requestUserInformation = {
        "ip_addr": ip_addr,
        "time": new Date()
    }
    //console.log("[API] Done:")

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

module.exports = router;