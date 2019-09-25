"use strict";

const AWS = require("aws-sdk");
AWS.config.update({region: process.env.AWS_REGION});
const DDB = new AWS.DynamoDB({apiVersion: "2012-10-08"});

const successfullResponse = {
    statusCode: 200,
    body: "Connected"
};


module.exports.connectionManager = async (event, context) => {
    if (event.requestContext.eventType === "CONNECT") {
        /* console.log("The event has:");
        console.log(JSON.stringify(event));
         The event has:
         2019-03-22 14:03:21.366 (-07:00)	2edd663b-83a2-4f9f-b021-8485ef2ae5e4	{"headers":{"Host":"2ciiyo81e6.execute-api.us-west-2.amazonaws.com","Sec-WebSocket-Extensions":"permessage-deflate; client_max_window_bits","Sec-WebSocket-Key":"9SpNGQCHHykxeOBjNILbtQ==","Sec-WebSocket-Version":"13","X-Amzn-Trace-Id":"Root=1-5c954d99-0549d9a29b9ad2d2125f8bee","X-Forwarded-For":"208.54.147.130","X-Forwarded-Port":"443","X-Forwarded-Proto":"https"},"multiValueHeaders":{"Host":["2ciiyo81e6.execute-api.us-west-2.amazonaws.com"],"Sec-WebSocket-Extensions":["permessage-deflate; client_max_window_bits"],"Sec-WebSocket-Key":["9SpNGQCHHykxeOBjNILbtQ=="],"Sec-WebSocket-Version":["13"],"X-Amzn-Trace-Id":["Root=1-5c954d99-0549d9a29b9ad2d2125f8bee"],"X-Forwarded-For":["208.54.147.130"],"X-Forwarded-Port":["443"],"X-Forwarded-Proto":["https"]},"queryStringParameters":{"sessionId":"1234"},"multiValueQueryStringParameters":{"sessionId":["1234"]},"requestContext":{"routeKey":"$connect","authorizer":"","messageId":null,"integrationLatency":"","eventType":"CONNECT","error":"","extendedRequestId":"W9kP9FNePHcF7sA=","requestTime":"22/Mar/2019:21:03:21 +0000","messageDirection":"IN","stage":"dev","connectedAt":1553288601354,"requestTimeEpoch":1553288601351,"identity":{"cognitoIdentityPoolId":null,"accountId":null,"cognitoIdentityId":null,"caller":null,"sourceIp":"208.54.147.130","accessKey":null,"cognitoAuthenticationType":null,"cognitoAuthenticationProvider":null,"userArn":null,"userAgent":null,"user":null},"requestId":"W9kP9FNePHcF7sA=","domainName":"2ciiyo81e6.execute-api.us-west-2.amazonaws.com","connectionId":"W9kP9eH5PHcCJIg=","apiId":"2ciiyo81e6","status":""},"isBase64Encoded":false} */
        // event.queryStringParameters.sessionId = "1234" when connecting with wscat -c wss://2ciiyo81e6.execute-api.us-west.amazonaws.com/dev/?sessionId=1234
        try {
            if (event.queryStringParameters.name) {
                await addConnection(event.requestContext.connectionId, event.queryStringParameters.name);
            } else {
                return {statusCode: 200, body: JSON.stringify({errors: ["A name must be provided."]})};
            }
        } catch (e) {
            return JSON.stringify(e);
        }
        return successfullResponse;
    } else if (event.requestContext.eventType === "DISCONNECT") {
        try {
            await deleteConnection(event.requestContext.connectionId);
        } catch (e) {
            return {
                statusCode: 500,
                body: "Failed to connect: " + JSON.stringify(e)
            }
        }
        return successfullResponse;
    }
};

module.exports.defaultMessage = async (event, context) => {
    return;
};

module.exports.sendMessage = async (event, context) => {
    let connectionData;
    try {
        connectionData = await DDB.scan({
            TableName: process.env.CHATCONNECTION_TABLE,
            ProjectionExpression: "connectionId"
        }).promise();
    } catch (err) {
        console.log(err);
        return {statusCode: 500};
    }
    const postCalls = connectionData.Items.map(async ({connectionId}) => {
        try {
            return send(event, connectionId.S);
        } catch (err) {
            if (err.statusCode === 410) {
                return deleteConnection(connectionId.S);
            }
            console.log(JSON.stringify(err));
            throw err;
        }
    });

    try {
        await Promise.all(postCalls);
    } catch (err) {
        console.log(err);
        return JSON.stringify(err);
    }
    return successfullResponse;
};

const send = (event, connectionId) => {
    const postData = JSON.parse(event.body).data;
    const apigwManagementApi = new AWS.ApiGatewayManagementApi({
        apiVersion: "2018-11-29",
        endpoint: event.requestContext.domainName + "/" + event.requestContext.stage
    });
    return apigwManagementApi
        .postToConnection({ConnectionId: connectionId, Data: postData})
        .promise();
};

const addConnection = async (connectionId, name) => {
    console.log(`Adding connection: ${connectionId}`);
    const putParams = {
        TableName: process.env.CHATCONNECTION_TABLE,
        Item: {
            connectionId: {S: connectionId},
            name: {S: name}
        }
    };

    return DDB.putItem(putParams).promise();
};

const deleteConnection = async connectionId => {
    console.log(`Deleting connection: ${connectionId}`);

    const deleteParams = {
        TableName: process.env.CHATCONNECTION_TABLE,
        Key: {
            connectionId: {S: connectionId}
        }
    };

    return DDB.deleteItem(deleteParams).promise();
};