import {createRestAPIClient, mastodon} from "masto";
import {requestUrl} from "obsidian";

async function createApp(server: string): Promise<{ clientId: string, clientSecret: string } | null> {
	try {
		const params = new URLSearchParams({
			client_name: 'Mastodon Threading for Obsidian',
			redirect_uris: 'obsidian://mastodon-threading',
			scopes: 'read write',
			website: 'https://github.com/elpamplina/mastodon-threading'
		});
		const resp = await requestUrl(
			{
				url: `https://${server}/api/v1/apps`,
				method: 'POST',
				headers: {'Content-Type': 'application/x-www-form-urlencoded'},
				body: params.toString(),
			},
		);
		const resp_json = await resp.json;
		return {
			clientId: resp_json.client_id,
			clientSecret: resp_json.client_secret,
		}
	} catch (err) {
		console.error(err);
		return null;
	}
}

async function getAuthURL(server: string, clientId: string): Promise<string | null> {
	const params = new URLSearchParams({
		client_id: clientId,
		scope: 'write',
		redirect_uri: 'obsidian://mastodon-threading',
		response_type: 'code',
	});
	return `https://${server}/oauth/authorize?${params.toString()}`;
}

async function getAuthToken(server: string, clientId: string, clientSecret: string, authCode: string): Promise<string> {
	const params = new URLSearchParams({
		client_id: clientId,
		client_secret: clientSecret,
		code: authCode,
		redirect_uri: 'obsidian://mastodon-threading',
		grant_type: 'authorization_code',
		scope: 'write',
	});
	const resp = await requestUrl({
		url: `https://${server}/oauth/token`,
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: params.toString(),
	});
	const tokenJSON = await resp.json;
	if (resp.status == 200) {
		return tokenJSON.access_token;
	}
	else {
		throw Error(`getAuthToken got ${resp.status} status: ${tokenJSON.error}`)
	}
}

function getClient(server: string, authToken: string): mastodon.rest.Client {
	return createRestAPIClient({
		url: `https://${server}`,
		accessToken: authToken,
	});
}

export {createApp, getAuthURL, getAuthToken, getClient}
