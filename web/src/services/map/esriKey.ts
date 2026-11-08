import { userKeyStore } from '../storage/userKey';

export const esriKeyStore = userKeyStore('esri:apikey');

export const useEsriKey = esriKeyStore.use;
