// netlify/functions/submit-lead.js
// Processes enhanced USIG lead form submissions
// Creates GHL opportunities + SMS notification

const fetch = require('node-fetch');

// Configuration
const GHL_API_KEY = process.env.GHL_API_KEY; // Set in Netlify environment
const GHL_LOCATION_ID = 'x0HFnEGuUCweDyholAxD';
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_FROM_NUMBER = process.env.TWILIO_FROM_NUMBER; // Your Twilio number
const BRENDA_PHONE = process.env.BRENDA_PHONE; // Brenda's phone number

exports.handler = async (event, context) => {
    // Only accept POST
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    try {
        const payload = JSON.parse(event.body);

        // 1. Create GHL Contact (if doesn't exist)
        const contactResult = await createOrUpdateGHLContact(payload);

        // 2. Create GHL Opportunity
        const opportunityResult = await createGHLOpportunity(payload, contactResult.id);

        // 3. Trigger GHL AI Conversation workflow based on lead quality
        await triggerGHLConversation(payload, contactResult.id);

        // 4. Send SMS notification to Brenda (if WARM lead)
        if (payload.status === 'active') {
            await sendSMSNotification(payload, opportunityResult);
        }

        return {
            statusCode: 200,
            body: JSON.stringify({
                success: true,
                contactId: contactResult.id,
                opportunityId: opportunityResult.id,
                leadQuality: payload.status,
                message: 'Lead processed successfully'
            })
        };

    } catch (error) {
        console.error('Function error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                success: false,
                error: error.message
            })
        };
    }
};

// ===================================
// CREATE OR UPDATE GHL CONTACT
// ===================================

async function createOrUpdateGHLContact(payload) {
    const contactPayload = {
        locationId: GHL_LOCATION_ID,
        firstName: payload.contactFirstName,
        lastName: payload.contactLastName,
        email: payload.contactEmail,
        phone: payload.contactPhone,
        tags: payload.tags,
        source: 'USIG Form - Enhanced',
        customFields: {
            'Lead_Source': 'USIG Form - Enhanced',
            'Lead_Quality': payload.status === 'active' ? 'WARM' : 'COLD',
            'Qualification_Score': payload.leadScore?.toString() || '0',
        }
    };

    try {
        const response = await fetch('https://api.gohighlevel.com/v1/contacts/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${GHL_API_KEY}`
            },
            body: JSON.stringify(contactPayload)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(`GHL Contact API error: ${error.message || response.statusText}`);
        }

        const result = await response.json();
        return {
            id: result.id || result.contact?.id,
            contact: result.contact || result
        };

    } catch (error) {
        console.error('Contact creation error:', error);
        throw error;
    }
}

// ===================================
// CREATE GHL OPPORTUNITY
// ===================================

async function createGHLOpportunity(payload, contactId) {
    // Map to your GHL opportunity/deal pipeline stage ID
    // You'll need to get this from GHL settings
    const pipelineStageMap = {
        'warm': 'your-ghl-warm-stage-id',  // Replace with actual GHL stage ID
        'cold': 'your-ghl-cold-stage-id'   // Replace with actual GHL stage ID
    };

    const opportunityPayload = {
        locationId: GHL_LOCATION_ID,
        contactId: contactId,
        name: payload.name,
        pipelineId: 'mortgage-pipeline', // Your GHL pipeline ID
        pipelineStageId: pipelineStageMap[payload.status] || 'new-lead',
        status: payload.status,
        monetaryValue: payload.monetaryValue || 0,
        description: payload.description,
        customFields: payload.customFields,
        tags: payload.tags
    };

    try {
        const response = await fetch('https://api.gohighlevel.com/v1/opportunities/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${GHL_API_KEY}`
            },
            body: JSON.stringify(opportunityPayload)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(`GHL Opportunity API error: ${error.message || response.statusText}`);
        }

        const result = await response.json();
        return {
            id: result.id || result.opportunity?.id,
            opportunity: result.opportunity || result
        };

    } catch (error) {
        console.error('Opportunity creation error:', error);
        throw error;
    }
}

// ===================================
// TRIGGER GHL AI CONVERSATION
// ===================================

async function triggerGHLConversation(payload, contactId) {
    // This triggers GHL's AI conversation automation
    // Different workflows for WARM vs COLD leads

    const workflow = {
        warm: 'immediate-follow-up-workflow',   // Brenda follow-up immediately
        cold: '90-day-nurture-workflow'         // AI text nurture for 90 days
    };

    const triggerPayload = {
        locationId: GHL_LOCATION_ID,
        contactId: contactId,
        workflowId: workflow[payload.status],
        loanType: payload.customFields.Loan_Type,
        leadQuality: payload.status
    };

    try {
        // Call your GHL automation trigger endpoint
        const response = await fetch('https://api.gohighlevel.com/v1/automations/triggers/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${GHL_API_KEY}`
            },
            body: JSON.stringify(triggerPayload)
        });

        if (!response.ok) {
            console.warn('Workflow trigger warning:', response.statusText);
            // Don't throw - workflow trigger is non-critical
        }

    } catch (error) {
        console.warn('Workflow trigger error (non-critical):', error.message);
    }
}

// ===================================
// SEND SMS NOTIFICATION TO BRENDA
// ===================================

async function sendSMSNotification(payload, opportunityResult) {
    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !BRENDA_PHONE) {
        console.warn('SMS configuration incomplete, skipping notification');
        return;
    }

    const loanType = payload.customFields.Loan_Type;
    const name = `${payload.contactFirstName} ${payload.contactLastName}`;
    const loanAmount = payload.monetaryValue ? `$${(payload.monetaryValue / 1000000).toFixed(1)}M` : 'TBD';
    const score = payload.leadScore || 0;

    let smsBody = '';
    if (loanType === 'Commercial Real Estate') {
        const propertyType = payload.customFields.CRE_Property_Type || 'TBD';
        const capRate = payload.customFields.CRE_Cap_Rate || 'TBD';
        smsBody = `🔴 WARM CRE LEAD: ${name} | ${propertyType} | Loan: ${loanAmount} | Cap Rate: ${capRate}% | Score: ${score}/100 | Phone: ${payload.contactPhone}`;
    } else {
        const creditScore = payload.customFields.Credit_Score_Range || 'TBD';
        smsBody = `🔴 WARM RES LEAD: ${name} | Loan: ${loanAmount} | Credit: ${creditScore} | Score: ${score}/100 | Phone: ${payload.contactPhone}`;
    }

    try {
        // Use Twilio to send SMS
        const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');
        
        const response = await fetch(
            `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: new URLSearchParams({
                    From: TWILIO_FROM_NUMBER,
                    To: BRENDA_PHONE,
                    Body: smsBody
                })
            }
        );

        if (!response.ok) {
            throw new Error(`Twilio API error: ${response.statusText}`);
        }

        const result = await response.json();
        console.log('SMS sent:', result.sid);

    } catch (error) {
        console.error('SMS notification error:', error);
        // Don't throw - SMS is nice-to-have, not critical
    }
}

// ===================================
// ERROR HANDLER
// ===================================

function formatError(error) {
    return {
        message: error.message,
        statusCode: error.statusCode || 500
    };
}
