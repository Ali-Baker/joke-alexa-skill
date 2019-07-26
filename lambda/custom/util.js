const AWS = require('aws-sdk');
AWS.config.update({region: "eu-west-1"});
const tableName = "jokes";

const docClient = new AWS.DynamoDB.DocumentClient();

const s3SigV4Client = new AWS.S3({
    signatureVersion: 'v4'
});

module.exports.getS3PreSignedUrl = function getS3PreSignedUrl(s3ObjectKey) {

    const bucketName = process.env.S3_PERSISTENCE_BUCKET;
    const s3PreSignedUrl = s3SigV4Client.getSignedUrl('getObject', {
        Bucket: bucketName,
        Key: s3ObjectKey,
        Expires: 60*1 // the Expires is capped for 1 minute
    });
    console.log(`Util.s3PreSignedUrl: ${s3ObjectKey} URL ${s3PreSignedUrl}`);
    return s3PreSignedUrl;

};

module.exports.addJoke = (jokeID, userID) => {
    return new Promise((resolve, reject) => {
        const params = {
            TableName: tableName,
            Item: {
                'jokeId': jokeID,
                'userId': userID
            },
            ReturnValues: 'ALL_OLD'
        };
        const docClient = new AWS.DynamoDB.DocumentClient();
        docClient.put(params, (err, data) => {
            if (err) {
                console.log("Unable to insert =>", JSON.stringify(err));
                return reject("Unable to insert");
            }
            resolve(data);
        });
    });
};

module.exports.getUserBadJokes = (userId) => {
    return new Promise((resolve, reject) => {
        const params = {
            TableName: tableName,
            KeyConditionExpression: "#userID = :user_id",
            ExpressionAttributeNames: {
                "#userID": "userId"
            },
            ExpressionAttributeValues: {
                ":user_id": userId
            },
            ProjectionExpression: "jokeId",
        }
        docClient.query(params, (err, data) => {
            if (err) {
                console.error("Unable to read item. Error JSON:", JSON.stringify(err, null, 2));
                return reject(JSON.stringify(err, null, 2))
            }
            const results = [];
            data.Items.forEach(item => results.push(item.jokeId))
            resolve(results)
        })
    });
}

