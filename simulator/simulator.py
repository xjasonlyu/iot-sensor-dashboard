"""Publish simulated IoT telemetry to the local EMQX broker."""

from __future__ import annotations

import json
import logging
import random
import signal
import threading
import uuid
from datetime import datetime, timezone
from typing import Any

import paho.mqtt.client as mqtt


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)
LOGGER = logging.getLogger("iot-simulator")

MQTT_HOST = "emqx"
MQTT_PORT = 1883
MQTT_CLIENT_ID = "iot-dashboard-simulator"
TOPIC_PREFIX = "iot"
NETWORK_ID = 1
INTERVAL_SECONDS = 3
DOOR_EVENT_PROBABILITY = 0.12

BATHROOM_SENSOR_ID = "SENSOR_7C3E822F6E550000"
DOOR_SENSOR_ID = "SENSOR_282C02BFFFEEE739"

stop_event = threading.Event()
connected_event = threading.Event()


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def clamp(value: float, minimum: float, maximum: float) -> float:
    return min(max(value, minimum), maximum)


def event(event_type: str, data: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(uuid.uuid4()),
        "type": event_type,
        "occurredAt": now_iso(),
        "data": data,
    }


def publish(client: mqtt.Client, topic: str, payload: dict[str, Any]) -> None:
    result = client.publish(topic, json.dumps(payload, separators=(",", ":")), qos=1)
    if result.rc != mqtt.MQTT_ERR_SUCCESS:
        raise RuntimeError(f"MQTT publish failed for {topic!r}: rc={result.rc}")


def on_connect(
    _client: mqtt.Client,
    _userdata: Any,
    _flags: mqtt.ConnectFlags,
    reason_code: mqtt.ReasonCode,
    _properties: mqtt.Properties | None,
) -> None:
    if reason_code == 0:
        connected_event.set()
        LOGGER.info("Connected to MQTT broker at %s:%s", MQTT_HOST, MQTT_PORT)
    else:
        connected_event.clear()
        LOGGER.error("MQTT connection rejected: %s", reason_code)


def on_disconnect(
    _client: mqtt.Client,
    _userdata: Any,
    _disconnect_flags: mqtt.DisconnectFlags,
    reason_code: mqtt.ReasonCode,
    _properties: mqtt.Properties | None,
) -> None:
    connected_event.clear()
    if not stop_event.is_set():
        LOGGER.warning("MQTT disconnected (%s); the client will reconnect", reason_code)


def request_stop(_signum: int, _frame: Any) -> None:
    stop_event.set()


def main() -> None:
    rng = random.SystemRandom()
    signal.signal(signal.SIGTERM, request_stop)
    signal.signal(signal.SIGINT, request_stop)

    client = mqtt.Client(
        callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
        client_id=MQTT_CLIENT_ID,
        protocol=mqtt.MQTTv5,
    )
    client.reconnect_delay_set(min_delay=1, max_delay=30)
    client.on_connect = on_connect
    client.on_disconnect = on_disconnect
    client.connect_async(MQTT_HOST, MQTT_PORT, keepalive=30)
    client.loop_start()

    temperature = 24.4
    humidity = 54.0

    try:
        while not stop_event.is_set():
            if not connected_event.wait(timeout=1):
                continue

            timestamp = now_iso()
            temperature = clamp(temperature + rng.uniform(-0.12, 0.12), 18.0, 32.0)
            humidity = clamp(humidity + rng.uniform(-0.8, 0.8), 30.0, 80.0)

            readings_topic = (
                f"{TOPIC_PREFIX}/networks/{NETWORK_ID}/sensors/"
                f"{BATHROOM_SENSOR_ID}/readings"
            )
            publish(
                client,
                readings_topic,
                event(
                    "sensor.reading",
                    {
                        "id": str(uuid.uuid4()),
                        "sensorId": BATHROOM_SENSOR_ID,
                        "metric": "temperature",
                        "value": round(temperature, 1),
                        "unit": "C",
                        "timestamp": timestamp,
                    },
                ),
            )
            publish(
                client,
                readings_topic,
                event(
                    "sensor.reading",
                    {
                        "id": str(uuid.uuid4()),
                        "sensorId": BATHROOM_SENSOR_ID,
                        "metric": "humidity",
                        "value": round(humidity),
                        "unit": "%",
                        "timestamp": timestamp,
                    },
                ),
            )

            activity_value = clamp(rng.betavariate(1.2, 5.0), 0.0, 1.0)
            publish(
                client,
                f"{TOPIC_PREFIX}/networks/{NETWORK_ID}/activity",
                event(
                    "activity.updated",
                    {
                        "networkId": NETWORK_ID,
                        "activity": round(activity_value, 4),
                        "timestamp": timestamp,
                    },
                ),
            )

            if rng.random() < DOOR_EVENT_PROBABILITY:
                publish(
                    client,
                    (
                        f"{TOPIC_PREFIX}/networks/{NETWORK_ID}/sensors/"
                        f"{DOOR_SENSOR_ID}/events"
                    ),
                    event(
                        "sensor.event",
                        {
                            "id": str(uuid.uuid4()),
                            "sensorId": DOOR_SENSOR_ID,
                            "type": "detected",
                            "timestamp": timestamp,
                        },
                    ),
                )

            LOGGER.info(
                "Published temperature=%.1fC humidity=%.0f%% activity=%.2f",
                temperature,
                humidity,
                activity_value,
            )
            stop_event.wait(INTERVAL_SECONDS)
    finally:
        client.disconnect()
        client.loop_stop()
        LOGGER.info("Simulator stopped")


if __name__ == "__main__":
    main()
