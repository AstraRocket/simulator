package com.google.inject;

/** SHIM: minimal Guice Injector; real Guice never runs in the web engine. */
public interface Injector {
    <T> T getInstance(Class<T> type);
}
