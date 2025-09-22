/* eslint-disable max-len */

export const WIFI_PRJ_CONF = `
# ─────────────────────────────
# Networking (core + IP + sockets)
# ─────────────────────────────
CONFIG_NETWORKING=y
CONFIG_NET_IPV4=y
CONFIG_NET_IPV6=n
CONFIG_NET_SOCKETS=y
CONFIG_NET_TCP=y

# DHCP client (comment out if using static IP with NET_CONFIG_*)
CONFIG_NET_DHCPV4=y

# ─────────────────────────────
# DNS
# ─────────────────────────────
CONFIG_DNS_RESOLVER=y
CONFIG_DNS_SERVER_IP_ADDRESSES=y
CONFIG_DNS_SERVER1="192.0.2.2"
CONFIG_DNS_RESOLVER_AI_MAX_ENTRIES=10

# ─────────────────────────────
# Wi-Fi management
# ─────────────────────────────
CONFIG_WIFI=y
CONFIG_NET_MGMT=y
CONFIG_NET_MGMT_EVENT=y
CONFIG_NET_L2_WIFI_MGMT=y

# Event queue tuning (optional, handy in busy environments)
CONFIG_NET_MGMT_EVENT_QUEUE_SIZE=16
CONFIG_NET_MGMT_EVENT_QUEUE_TIMEOUT=5000

# Connection manager (helps bring interfaces up/down automatically)
CONFIG_NET_CONNECTION_MANAGER=y

# ─────────────────────────────
# Logging & diagnostics
# ─────────────────────────────
CONFIG_NET_LOG=y
CONFIG_INIT_STACKS=y
CONFIG_NET_STATISTICS=y
CONFIG_NET_STATISTICS_PERIODIC_OUTPUT=n

# ─────────────────────────────
# Thread/stack sizes & buffers
# (tune to your target if needed)
# ─────────────────────────────
CONFIG_MAIN_STACK_SIZE=5200
CONFIG_SHELL_STACK_SIZE=5200
CONFIG_NET_TX_STACK_SIZE=2048
CONFIG_NET_RX_STACK_SIZE=2048
CONFIG_LOG_BUFFER_SIZE=4096

CONFIG_NET_PKT_RX_COUNT=10
CONFIG_NET_PKT_TX_COUNT=10
CONFIG_NET_BUF_RX_COUNT=20
CONFIG_NET_BUF_TX_COUNT=20
CONFIG_NET_MAX_CONN=10
CONFIG_NET_MAX_CONTEXTS=10

# ─────────────────────────────
# Optional clients
# ─────────────────────────────
CONFIG_HTTP_CLIENT=y

# ─────────────────────────────
# Test helpers
# ─────────────────────────────
CONFIG_TEST_RANDOM_GENERATOR=y
`;

export const WIFI_HTTP_C = `#include "http.h"

#include <zephyr/kernel.h>
#include <zephyr/data/json.h>
#include <zephyr/logging/log.h>
#include <zephyr/net/http/client.h>
#include <zephyr/net/net_config.h>
#include <zephyr/net/net_if.h>
#include <zephyr/net/net_ip.h>
#include <zephyr/net/socket.h>
#include <zephyr/net/wifi_mgmt.h>
#include <zephyr/posix/netdb.h>

#include "json_definitions.h"

LOG_MODULE_REGISTER(http);

#define HTTP_PORT "80"

static K_SEM_DEFINE(json_response_complete, 0, 1);
static K_SEM_DEFINE(http_response_complete, 0, 1);
static const char * json_post_headers[] = { "Content-Type: application/json\\r\\n", NULL };

// Holds the HTTP response
static char response_buffer[2048];

// Holds the JSON payload
char json_payload_buffer[128];

// Keeps track of JSON parsing result
static struct json_example_object * returned_placeholder_post = NULL;
static int json_parse_result = -1;

// void http_get(const char * hostname, const char * path);

int connect_socket(const char * hostname)
{
    static struct addrinfo hints;
	struct addrinfo *res;
	int st, sock;

	LOG_DBG("Looking up IP addresses:");
    hints.ai_family = AF_UNSPEC;
	hints.ai_socktype = SOCK_STREAM;
	st = getaddrinfo(hostname, HTTP_PORT, &hints, &res);
	if (st != 0) {
		LOG_ERR("Unable to resolve address, quitting");
		return -1;
	}
	LOG_DBG("getaddrinfo status: %d", st);

	dump_addrinfo(res);

	sock = socket(res->ai_family, res->ai_socktype, res->ai_protocol);
	if (sock < 0)
	{
		LOG_ERR("Issue setting up socket: %d", sock);
		return -1;
	}
	LOG_DBG("sock = %d", sock);

	LOG_INF("Connecting to server...");
	int connect_result = connect(sock, res->ai_addr, res->ai_addrlen);
	if (connect_result != 0)
	{
		LOG_ERR("Issue during connect: %d", sock);
		return -1;
	}

    return sock;
}

static void http_response_cb(struct http_response *rsp,
	enum http_final_call final_data,
	void *user_data)
{
	printk("HTTP Callback: %.*s", rsp->data_len, rsp->recv_buf);

	if (HTTP_DATA_FINAL == final_data){
		printk("\\n");
		k_sem_give(&http_response_complete);
	}
}

void http_get_example(const char * hostname, const char * path)
{
	int sock = connect_socket(hostname);
	if (sock < 0)
	{
		LOG_ERR("Issue setting up socket: %d", sock);
		return;
	}

	LOG_INF("Connected. Making HTTP request...");

	struct http_request req = { 0 };
	int ret;

	req.method = HTTP_GET;
	req.host = hostname;
	req.url = path;
	req.protocol = "HTTP/1.1";
	req.response = http_response_cb;
	req.recv_buf = response_buffer;
	req.recv_buf_len = sizeof(response_buffer);

	/* sock is a file descriptor referencing a socket that has been connected
	* to the HTTP server.
	*/
	ret = http_client_req(sock, &req, 5000, NULL);
	LOG_INF("HTTP Client Request returned: %d", ret);
	if (ret < 0)
	{
		LOG_ERR("Error sending HTTP Client Request");
		return;
	}

	k_sem_take(&http_response_complete, K_FOREVER);

	LOG_INF("HTTP GET complete");

	LOG_INF("Close socket");

	(void)close(sock);
}

static void json_response_cb(struct http_response *rsp,
	enum http_final_call final_data,
	void *user_data)
{
	LOG_DBG("JSON Callback: %.*s", rsp->data_len, rsp->recv_buf);

	if (rsp->body_found)
	{
		LOG_DBG("Body:");
		printk("%.*s\\n", rsp->body_frag_len, rsp->body_frag_start);

		if (returned_placeholder_post != NULL)
		{
			json_parse_result = json_obj_parse(
				rsp->body_frag_start,
				rsp->body_frag_len,
				json_example_object_descr,
				ARRAY_SIZE(json_example_object_descr),
				returned_placeholder_post
			);

			if (json_parse_result < 0)
			{
				LOG_ERR("JSON Parse Error: %d", json_parse_result);
			}
			else
			{
				LOG_DBG("json_obj_parse return code: %d", json_parse_result);
				LOG_DBG("Title: %s", returned_placeholder_post->title);
				LOG_DBG("Body: %s", returned_placeholder_post->body);
				LOG_DBG("User ID: %d", returned_placeholder_post->id);
				LOG_DBG("ID: %d", returned_placeholder_post->userId);
			}
		} else {
			LOG_ERR("No pointer passed to copy JSON GET result to");
		}
	}

	if (HTTP_DATA_FINAL == final_data){
		k_sem_give(&json_response_complete);
	}
}

int json_get_example(const char * hostname, const char * path, struct json_example_object * result)
{
	json_parse_result = -1;
	returned_placeholder_post = result;

	int sock = connect_socket(hostname);
	if (sock < 0)
	{
		LOG_ERR("Issue setting up socket: %d", sock);
		return -1;
	}

	LOG_INF("Connected. Get JSON Payload...");

	struct http_request req = { 0 };
	int ret;

	req.method = HTTP_GET;
	req.host = hostname;
	req.url = path;
	req.protocol = "HTTP/1.1";
	req.response = json_response_cb;
	req.recv_buf = response_buffer;
	req.recv_buf_len = sizeof(response_buffer);

	/* sock is a file descriptor referencing a socket that has been connected
	* to the HTTP server.
	*/
	ret = http_client_req(sock, &req, 5000, NULL);
	LOG_INF("HTTP Client Request returned: %d", ret);
	if (ret < 0)
	{
		LOG_ERR("Error sending HTTP Client Request");
		return -1;
	}

	k_sem_take(&json_response_complete, K_FOREVER);

	LOG_INF("JSON Response complete");

	LOG_INF("Close socket");

	(void)close(sock);

	return json_parse_result;
}

int json_post_example(const char * hostname, const char * path, struct json_example_payload * payload, struct json_example_object * result)
{
	json_parse_result = -1;
	returned_placeholder_post = result;

    int sock = connect_socket(hostname);
	if (sock < 0)
	{
		LOG_ERR("Issue setting up socket: %d", sock);
		return -1;
	}

	LOG_INF("Connected. Post JSON Payload...");

	// Parse the JSON object into a buffer
	int required_buffer_len = json_calc_encoded_len(
		json_example_payload_descr,
		ARRAY_SIZE(json_example_payload_descr),
		payload
	);
	if (required_buffer_len > sizeof(json_payload_buffer))
	{
		LOG_ERR("Payload is too large. Increase size of json_payload_buffer in http.c");
		return -1;
	}

	int encode_status = json_obj_encode_buf(
		json_example_payload_descr,
		ARRAY_SIZE(json_example_payload_descr),
		payload,
		json_payload_buffer,
		sizeof(json_payload_buffer)
	);
	if (encode_status < 0)
	{
		LOG_ERR("Error encoding JSON payload: %d", encode_status);
		return -1;
	}

	LOG_DBG("%s", json_payload_buffer);

    struct http_request req = { 0 };
	int ret;

	req.method = HTTP_POST;
	req.host = hostname;
	req.url = path;
	req.header_fields = json_post_headers;
	req.protocol = "HTTP/1.1";
	req.response = json_response_cb;
	req.payload = json_payload_buffer;
	req.payload_len = strlen(json_payload_buffer);
	req.recv_buf = response_buffer;
	req.recv_buf_len = sizeof(response_buffer);

	ret = http_client_req(sock, &req, 5000, NULL);
	LOG_INF("HTTP Client Request returned: %d", ret);
	if (ret < 0)
	{
		LOG_ERR("Error sending HTTP Client Request");
		return -1;
	}

	k_sem_take(&json_response_complete, K_FOREVER);

	LOG_INF("JSON POST complete");

	LOG_INF("Close socket");

	(void)close(sock);

	return json_parse_result;
}

void dump_addrinfo(const struct addrinfo *ai)
{
	LOG_INF("addrinfo @%p: ai_family=%d, ai_socktype=%d, ai_protocol=%d, "
	       "sa_family=%d, sin_port=%x",
	       ai, ai->ai_family, ai->ai_socktype, ai->ai_protocol, ai->ai_addr->sa_family,
	       ntohs(((struct sockaddr_in *)ai->ai_addr)->sin_port));
}
`;

export const WIFI_HTTP_H = `#pragma once

#include <zephyr/net/http/client.h>
#include <zephyr/posix/netdb.h>

#include "json_definitions.h"

void dump_addrinfo(const struct addrinfo *ai);

void http_get_example(const char * hostname, const char * path);

int json_get_example(const char * hostname, const char * path, struct json_example_object * result);

int json_post_example(const char * hostname, const char * path, struct json_example_payload * payload, struct json_example_object * result);
`;

export const WIFI_JSON_DEFINITIONS_H = `#pragma once

#include <zephyr/data/json.h>

struct json_example_object {
	const char *title;
	const char *body;
	int id;
	int userId;
};

static const struct json_obj_descr json_example_object_descr[] = {
	JSON_OBJ_DESCR_PRIM(struct json_example_object, title, JSON_TOK_STRING),
	JSON_OBJ_DESCR_PRIM(struct json_example_object, body, JSON_TOK_STRING),
	JSON_OBJ_DESCR_PRIM(struct json_example_object, id, JSON_TOK_NUMBER),
	JSON_OBJ_DESCR_PRIM(struct json_example_object, userId, JSON_TOK_NUMBER),
};

struct json_example_payload {
	const char *title;
	const char *body;
    int userId;
};

static const struct json_obj_descr json_example_payload_descr[] = {
	JSON_OBJ_DESCR_PRIM(struct json_example_payload, title, JSON_TOK_STRING),
	JSON_OBJ_DESCR_PRIM(struct json_example_payload, body, JSON_TOK_STRING),
	JSON_OBJ_DESCR_PRIM(struct json_example_payload, userId, JSON_TOK_NUMBER),
};
`;

export const WIFI_PING_C = `#include "ping.h"

#include <zephyr/kernel.h>
#include <zephyr/logging/log.h>
#include <zephyr/net/icmp.h>
#include <zephyr/net/socket.h>

LOG_MODULE_REGISTER(ping);

int icmp_echo_reply_handler(struct net_icmp_ctx *ctx,
    struct net_pkt *pkt,
    struct net_icmp_ip_hdr *hdr,
    struct net_icmp_hdr *icmp_hdr,
    void *user_data)
{
    uint32_t cycles;
    char ipv4[INET_ADDRSTRLEN];
    zsock_inet_ntop(AF_INET, &hdr->ipv4->src, ipv4, INET_ADDRSTRLEN);

    uint32_t *start_cycles = user_data;

    cycles = k_cycle_get_32() - *start_cycles;

    LOG_INF("Reply from %s: bytes=%d time=%dms TTL=%d",
    ipv4,
    ntohs(hdr->ipv4->len),
    ((uint32_t)k_cyc_to_ns_floor64(cycles) / 1000000),
    hdr->ipv4->ttl);

    return 0;
}

void ping(char* ipv4_addr, uint8_t count)
{
    uint32_t cycles;
    int ret;
    struct net_icmp_ctx icmp_context;

    // Register handler for echo reply
    ret = net_icmp_init_ctx(&icmp_context, NET_ICMPV4_ECHO_REPLY, 0, icmp_echo_reply_handler);
    if (ret != 0) {
        LOG_ERR("Failed to init ping, err: %d", ret);
    }

    struct net_if *iface = net_if_get_default();
    struct sockaddr_in dst_addr;
    net_addr_pton(AF_INET, ipv4_addr, &dst_addr.sin_addr);
    dst_addr.sin_family = AF_INET;

    for (int i = 0; i < count; i++)
    {
        cycles = k_cycle_get_32();
        ret = net_icmp_send_echo_request(&icmp_context, iface, (struct sockaddr *)&dst_addr, NULL, &cycles);
        if (ret != 0) {
            LOG_ERR("Failed to send ping, err: %d", ret);
        }
        k_sleep(K_SECONDS(1));
    }

    net_icmp_cleanup_ctx(&icmp_context);
}
`;

export const WIFI_PING_H = `#pragma once

#include <stdint.h>

void ping(char* ipv4_addr, uint8_t count);
`;

export const WIFI_WIFI_C = `#include "wifi.h"

#include <zephyr/logging/log.h>
#include <zephyr/net/wifi_mgmt.h>

LOG_MODULE_REGISTER(wifi);

void wifi_connect(const char * ssid, const char * psk)
{
	struct net_if *iface = net_if_get_default();
	struct wifi_connect_req_params cnx_params = { 0 };

	cnx_params.ssid = ssid;
	cnx_params.ssid_length = strlen(cnx_params.ssid);
	cnx_params.psk = psk;
	cnx_params.psk_length = strlen(cnx_params.psk);
    cnx_params.security = WIFI_SECURITY_TYPE_NONE;
	cnx_params.band = WIFI_FREQ_BAND_UNKNOWN;
	cnx_params.channel = WIFI_CHANNEL_ANY;
	cnx_params.mfp = WIFI_MFP_OPTIONAL;
	cnx_params.wpa3_ent_mode = WIFI_WPA3_ENTERPRISE_NA;
	cnx_params.eap_ver = 1;
	cnx_params.bandwidth = WIFI_FREQ_BANDWIDTH_20MHZ;
	cnx_params.verify_peer_cert = false;

	int connection_result = 1;
	
	while (connection_result != 0){
		LOG_INF("Attempting to connect to network %s", ssid);
		connection_result = net_mgmt(NET_REQUEST_WIFI_CONNECT, iface,
				&cnx_params, sizeof(struct wifi_connect_req_params));
		if (connection_result) {
			LOG_ERR("Connection request failed with error: %d\\n", connection_result);
		}
		k_sleep(K_MSEC(1000));
	}

	LOG_INF("Connection succeeded.");
}
`;

export const WIFI_WIFI_H = `#pragma once

void wifi_connect(const char * ssid, const char * psk);
`;
