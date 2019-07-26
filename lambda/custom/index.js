const Alexa = require('ask-sdk-core');
const client = require('https');
const util = require('./util');
const jokes = [];

const PERMISSIONS = ['alexa::alerts:reminders:skill:readwrite'];

const LaunchRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
    },
    handle(handlerInput) {
        const speakOutput = 'Welcome, you can say Joke or Help. Which would you like to try?';
        const attributes = {};
        handlerInput.attributesManager.setSessionAttributes(attributes);
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};
const JokeIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'JokeIntent';
    },
    async handle(handlerInput) {
        if(jokes.length === 0) {
            for(let i = 0; i < 10; i++){
                await getJoke().then(res => {
                    jokes.push(res);
                }).catch(err => speechOutput = err);
            }
        }


        const userId = handlerInput.requestEnvelope.context.System.user.userId;
        const badJokes = await util.getUserBadJokes(userId);
        const filteredJokes = jokes.filter(joke => !badJokes.includes(joke.id));
        if (filteredJokes.length === 0) {
            return handlerInput.responseBuilder.speak('no more jokes').getResponse();
        }

        const randomIndex = Math.floor(Math.random() * filteredJokes.length);
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
        sessionAttributes.jokeId = filteredJokes[randomIndex].id;

        return handlerInput.responseBuilder
          .speak(`
            <speak>
              ${filteredJokes[randomIndex].joke} <break time="1s"/> 
              <voice name="Emma">Did you like this joke?</voice> 
            </speak> 
          `)
          .reprompt(`<voice name="Emma">Did you like this joke?</voice> `)
          .getResponse();
    }
};
const YesNoIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
          && Alexa.getIntentName(handlerInput.requestEnvelope) === 'YesNoIntent';
    },
    async handle(handlerInput) {
        const yesNoSlot = handlerInput.requestEnvelope.request.intent.slots.yesNo;
        const like = yesNoSlot.resolutions.resolutionsPerAuthority[0].values[0].value.id;
        let responseText;

        if(like === 'YES') {
            responseText = `<audio src="https://aliali7-public.s3-eu-west-1.amazonaws.com/455.mp3" />`;
        } else {
            const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
            const userId = handlerInput.requestEnvelope.context.System.user.userId;
            await util.addJoke(sessionAttributes.jokeId, userId);
            responseText = "Sorry about that, I'll make a note";
        }
        return handlerInput.responseBuilder
          .speak(responseText)
          .getResponse();
    }
};
const CreateReminderIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
          && Alexa.getIntentName(handlerInput.requestEnvelope) === 'CreateReminderIntent';
    },
    async handle(handlerInput) {
        const requestEnvelope = handlerInput.requestEnvelope;
        const responseBuilder = handlerInput.responseBuilder;
        const consentToken = requestEnvelope.context.System.apiAccessToken;

        switch (requestEnvelope.request.intent.confirmationStatus) {
            case 'CONFIRMED':
                console.log('Alexa confirmed intent, so clear to create reminder');
                break;
            case 'DENIED':
                console.log('Alexa disconfirmed the intent; not creating reminder');
                return responseBuilder
                  .speak('Permission denied')
                  .reprompt('What would like me to do')
                  .getResponse();
            case 'NONE':
            default:
                console.log('delegate back to Alexa to get confirmation');
                return responseBuilder
                  .addDelegateDirective()
                  .getResponse();
        }

        if (!consentToken) {
            return responseBuilder
              .speak('Please enable Reminder permissions from your Alexa app.')
              .withAskForPermissionsConsentCard(PERMISSIONS)
              .getResponse();
        }
        try {
            const client = handlerInput.serviceClientFactory.getReminderManagementServiceClient();

            const reminderRequest = {
                trigger: {
                    type: 'SCHEDULED_RELATIVE',
                    offsetInSeconds: '30',
                },
                alertInfo: {
                    spokenInfo: {
                        content: [{
                            locale: 'en-GB',
                            text: 'just another joke',
                        }],
                    },
                },
                pushNotification: {
                    status: 'ENABLED',
                },
            };
            const reminderResponse = await client.createReminder(reminderRequest);
            console.log(JSON.stringify(reminderResponse));
        } catch (error) {
            if (error.name !== 'ServiceError') {
                console.log(`error: ${error.stack}`);
                return responseBuilder.speak(messages.ERROR).getResponse();
            }
            throw error;
        }

        const time = handlerInput.requestEnvelope.request.intent.slots.time;

        return responseBuilder
          .speak(`I'll tell you a joke everyday at ${time}`)
          .getResponse();
    }
};
const HelpIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.HelpIntent';
    },
    handle(handlerInput) {
        const speakOutput = 'You can say hello to me! How can I help?';

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};
const CancelAndStopIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && (Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.CancelIntent'
                || Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.StopIntent');
    },
    handle(handlerInput) {
        const speakOutput = 'Goodbye!';
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .getResponse();
    }
};
const SessionEndedRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'SessionEndedRequest';
    },
    handle(handlerInput) {
        // Any cleanup logic goes here.
        return handlerInput.responseBuilder.getResponse();
    }
};

// The intent reflector is used for interaction model testing and debugging.
// It will simply repeat the intent the user said. You can create custom handlers
// for your intents by defining them above, then also adding them to the request
// handler chain below.
const IntentReflectorHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest';
    },
    handle(handlerInput) {
        const intentName = Alexa.getIntentName(handlerInput.requestEnvelope);
        const speakOutput = `You just triggered ${intentName}`;

        return handlerInput.responseBuilder
            .speak(speakOutput)
            //.reprompt('add a reprompt if you want to keep the session open for the user to respond')
            .getResponse();
    }
};

// Generic error handling to capture any syntax or routing errors. If you receive an error
// stating the request handler chain is not found, you have not implemented a handler for
// the intent being invoked or included it in the skill builder below.
const ErrorHandler = {
    canHandle() {
        return true;
    },
    handle(handlerInput, error) {
        console.log(`~~~~ Error handled: ${error.stack}`);
        const speakOutput = `Sorry, I had trouble doing what you asked. Please try again.`;

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};

const getJoke = () => {
    const options = {
        hostname: 'icanhazdadjoke.com',
        path: '/',
        headers: {
            Accept: 'application/json'
        }
    };

    return new Promise((resolve, reject) => {
        client.get(options, res => {
            let data = '';
            res.on('data', d => {
                data += d;
            });
            res.on('end', function() {
                if (res.statusCode === 200) {
                    resolve(JSON.parse(data));
                } else {
                    reject('Something went wrong');
                }
            });
            res.on('error', (err) => reject(err))
        });
    })
};

const RequestLog = {
    async process(handlerInput) {
        console.log(`REQUEST ENVELOPE = ${JSON.stringify(handlerInput.requestEnvelope)}`);
    },
};

const ResponseLog = {
    process(handlerInput) {
        console.log(`RESPONSE = ${JSON.stringify(handlerInput.responseBuilder.getResponse())}`);
    },
};

// The SkillBuilder acts as the entry point for your skill, routing all request and response
// payloads to the handlers above. Make sure any new handlers or interceptors you've
// defined are included below. The order matters - they're processed top to bottom.
exports.handler = Alexa.SkillBuilders.custom()
    .addRequestHandlers(
        LaunchRequestHandler,
        JokeIntentHandler,
        YesNoIntentHandler,
        CreateReminderIntentHandler,
        HelpIntentHandler,
        CancelAndStopIntentHandler,
        SessionEndedRequestHandler,
        IntentReflectorHandler, // make sure IntentReflectorHandler is last so it doesn't override your custom intent handlers
        )
    .addRequestInterceptors(RequestLog)
    .addResponseInterceptors(ResponseLog)
    .addErrorHandlers(
        ErrorHandler,
        )
    .withApiClient(new Alexa.DefaultApiClient())
    .lambda();
