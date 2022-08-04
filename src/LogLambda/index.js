async function handler(event, context) {
    console.log(JSON.stringify(event));
    console.log(context);
};

exports.handler = handler;