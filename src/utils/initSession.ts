import { Session } from '@ftrack/api';
import dotenv from 'dotenv';
dotenv.config();

export function getEnvironmentCredentials() {
    const ftrackServer = process.env.FTRACK_SERVER;
    const ftrackApiUser = process.env.FTRACK_API_USER;
    const ftrackApiKey = process.env.FTRACK_API_KEY;
    if (!ftrackServer || !ftrackApiUser || !ftrackApiKey) {
        throw new Error('Missing required environment variables. Please check your .env file.');
    }
    return { ftrackServer, ftrackApiUser, ftrackApiKey };

}

export async function initSession(): Promise<Session> {
    const { ftrackServer, ftrackApiUser, ftrackApiKey } = getEnvironmentCredentials();
    const session = new Session(ftrackServer, ftrackApiUser, ftrackApiKey, { autoConnectEventHub: false });
    await session.initializing;
    return session;
}