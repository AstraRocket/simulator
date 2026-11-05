import { userKeyStore } from '../storage/userKey';

export const weatherKeyStore = userKeyStore('openmeteo:apikey');

export const readWeatherKey = weatherKeyStore.read;
