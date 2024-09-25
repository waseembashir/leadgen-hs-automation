

const axios = require('axios');
const cron = require('node-cron');
const express = require('express');

// HubSpot API configuration
const API_KEY = process.env.API_KEY;
const BASE_URL = 'https://api.hubapi.com';

// Helper function to make API requests
async function makeRequest(endpoint, method = 'GET', data = null) {
    const url = `${BASE_URL}${endpoint}`;
    const headers = {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
    };
    try {
        const response = await axios({ method, url, headers, data });
        return response.data;
    } catch (error) {
        console.error(`Error making request to ${endpoint}:`, error.message);
        if (error.response) {
            console.error('Response data:', error.response.data);
            console.error('Response status:', error.response.status);
        }
        throw error;
    }
}

// Get all contacts
async function getAllContacts() {
    let contacts = [];
    let after = undefined;
    while (true) {
        const endpoint = `/crm/v3/objects/contacts?limit=100${after ? `&after=${after}` : ''}&properties=email,hubspot_owner_id`;
        const response = await makeRequest(endpoint);
        contacts = contacts.concat(response.results);
        if (!response.paging || !response.paging.next) {
            break;
        }
        after = response.paging.next.after;
    }
    return contacts;
}

// Get all deals
async function getAllDeals() {
    let deals = [];
    let after = undefined;
    while (true) {
        const endpoint = `/crm/v3/objects/deals?limit=100${after ? `&after=${after}` : ''}&properties=dealname,hubspot_owner_id,email`;
        const response = await makeRequest(endpoint);
        deals = deals.concat(response.results);
        if (!response.paging || !response.paging.next) {
            break;
        }
        after = response.paging.next.after;
    }
    return deals;
}

// Update contact owner
async function updateContactOwner(contactId, ownerId) {
    const endpoint = `/crm/v3/objects/contacts/${contactId}`;
    const data = {
        properties: {
            hubspot_owner_id: ownerId
        }
    };
    await makeRequest(endpoint, 'PATCH', data);
}

// Main function to match emails and update contact owners
async function matchEmailsAndUpdateOwners() {
    try {
        const contacts = await getAllContacts();
        console.log(`Found ${contacts.length} contacts`);
        const deals = await getAllDeals();
        console.log(`Found ${deals.length} deals`);
        let updatedCount = 0;
        for (const contact of contacts) {
            const contactId = contact.id;
            const contactEmail = contact.properties.email;
            const currentOwner = contact.properties.hubspot_owner_id;
            console.log(`\nProcessing contact ${contactId} with email ${contactEmail}`);
            const matchingDeals = deals.filter(deal => deal.properties.email === contactEmail);
            if (matchingDeals.length > 0) {
                console.log(`Found ${matchingDeals.length} matching deals for contact ${contactId}`);
                const mostRecentDeal = matchingDeals.reduce((latest, current) => {
                    return new Date(current.properties.createdate) > new Date(latest.properties.createdate) ? current : latest;
                });
                const newOwner = mostRecentDeal.properties.hubspot_owner_id;
                if (newOwner && newOwner !== currentOwner) {
                    console.log(`Updating contact ${contactId} owner from ${currentOwner || 'none'} to ${newOwner}`);
                    await updateContactOwner(contactId, newOwner);
                    updatedCount++;
                } else {
                    console.log(`No owner update needed for contact ${contactId}`);
                }
            } else {
                console.log(`No matching deals found for contact ${contactId}`);
            }
        }
        console.log(`\nProcess completed. Updated ${updatedCount} contacts.`);
    } catch (error) {
        console.error('Error in matchEmailsAndUpdateOwners:', error.message);
    }
}

// Schedule the task to run every minute
try {
    cron.schedule('* * * * *', () => {
        console.log('Running the scheduled task...');
        matchEmailsAndUpdateOwners();
    });
} catch (error) {
    console.error('Error scheduling cron job:', error.message);
}

// Start the server (optional, if you need a web server for other purposes)
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('Billow HubSpot Update Service is running!');
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
