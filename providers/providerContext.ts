import axios from "axios";
import { headers } from "./headers";
import * as cheerio from "cheerio";
import { ProviderContext } from "./types";

const mockStorage = new Map<string, unknown>();

export const providerContext: ProviderContext = {
  axios,
  commonHeaders: headers,
  // webview not aviable in local test only avaiable in app
  openWebView: (url: string, options?: any) => {
    return Promise.resolve({
      success: false,
      data: "",
      cookies: "",
      cookieMap: {},
      userAgent: "",
      url: url,
    } as import("./types").OpenWebViewResult);
  },
  cheerio,
  kvStore: {
    get: async <T = unknown>(key: string): Promise<T | undefined> => {
      const val = mockStorage.get(key);
      return val !== undefined ? JSON.parse(JSON.stringify(val)) : undefined;
    },
    set: async (key: string, value: unknown): Promise<void> => {
      if (value === undefined) {
        mockStorage.delete(key);
        return;
      }
      mockStorage.set(key, JSON.parse(JSON.stringify(value)));
    },
    delete: async (key: string): Promise<boolean> => {
      return mockStorage.delete(key);
    },
    keys: async (): Promise<string[]> => {
      return Array.from(mockStorage.keys());
    },
    clear: async (): Promise<void> => {
      mockStorage.clear();
    },
  },
};
