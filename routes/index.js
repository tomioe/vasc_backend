var express = require('express');
var router = express.Router();

const serverCrypto =  require("crypto");


//Catches requests made to / [root]
router.get("/", (req, res) => {
	const hashFunction = serverCrypto.createHash("sha256");
	hashFunction.update(new String(new Date().getTime()).concat("1"));
	res.send(hashFunction.digest("hex"));
});

module.exports = router;