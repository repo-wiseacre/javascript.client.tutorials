// GUI elements
var url, username, password, virtualhost, connectBut, disconnectBut;
var consumeExchange, consumeMessage, sendBut, flowOnBut, flowOffBut;
var txExchange, txMessage, selectBut, txSendBut, commitBut, rollbackBut;
var logConsole, clearBut, toggleAmqpPropsCb, receivedMessageCount;
var propertiesToggle, propertiesDivContent;
var headersToggle, headersDivContent;
var propAppId, propContentEncoding, propContentType, propCorrelationId, propDeliveryMode;
var propExpiration, propMessageId, propPriority, propReplyTo, propTimestamp, propType, propUserId;
var headerName1, headerType1, headerValue1;
var headerName2, headerType2, headerValue2;
var ssoUsername, ssoPassword;

// A factory for creating AMQP clients.
var amqpClientFactory;

// The AMQP client used for this application.
var amqpClient;

// Attributes used by the regular (non-transactional) channel.
var queueName;
var myConsumerTag;
var routingKey;

// Attributes used by the transactional channel.
var txnQueueName;
var myTxnConsumerTag;
var txnRoutingKey;

// Channels publish and consume, both non-transactional and transactional.
var publishChannel;
var consumeChannel;
var txnPublishChannel;
var txnConsumeChannel;

// Track the number of messages consumed.
var receivedMessageCounter;

// An incrementing id counter used for message ids.
var messageIdCounter;

$(document).ready(function () {

	// Create references to GUI objects.

	url = $("#url");
	username = $("#username");
	password = $("#password");
	virtualhost = $("#virtualhost");
	connectBut = $("#connectBut");
	disconnectBut = $("#disconnectBut");

	propertiesToggle = $("#propertiesToggle");
	propertiesDivContent = $("#properties_div_content")

	propAppId = $("#propAppId");
	propContentEncoding = $("#propContentEncoding");
	propContentType = $("#propContentType");
	propCorrelationId = $("#propCorrelationId");
	propDeliveryMode = $("#propDeliveryMode");
	propExpiration = $("#propExpiration");
	propMessageId = $("#propMessageId");
	propPriority = $("#propPriority");
	propReplyTo = $("#propReplyTo");
	propTimestamp = $("#propTimestamp");
	propType = $("#propType");
	propUserId = $("#propUserId");

	headersToggle = $("#headersToggle");
	headersDivContent = $("#headers_div_content")

	headerName1 = $("#headerName1");
	headerType1 = $("#headerType1");
	headerValue1 = $("#headerValue1");
	headerName2 = $("#headerName2");
	headerType2 = $("#headerType2");
	headerValue2 = $("#headerValue2");

	consumeExchange = $("#consumeExchange");
	consumeMessage = $("#consumeMessage");
	sendBut = $("#sendBut");
	flowOnBut = $("#flowOnBut");
	flowOffBut = $("#flowOffBut");

	txExchange = $("#txExchange");
	txMessage = $("#txMessage");
	selectBut = $("#selectBut");
	txSendBut = $("#txSendBut");
	commitBut = $("#commitBut");
	rollbackBut = $("#rollbackBut");

	logConsole = $("div#console");
	receivedMessageCount = $("#receivedMessageCount");
	clearBut = $("#clearBut");
	toggleAmqpPropsCb = $("#toggleAmqpPropsCb");

	ssoUsername = $("#sso_username");
	ssoPassword = $("#sso_password");

	// Add event handlers.

	connectBut.click(handleConnect);
	disconnectBut.click(handleDisconnect);

	propertiesToggle.click(handlePropertiesToggle);

	headersToggle.click(handleHeadersToggle);

	sendBut.click(handleSend);
	flowOnBut.click(handleFlowOn);
	flowOffBut.click(handleFlowOff);

	selectBut.click(handleSelect);
	commitBut.click(handleCommit);
	txSendBut.click(handleTxSend);
	rollbackBut.click(handleRollback);

	clearBut.click(handleClearLog);
	toggleAmqpPropsCb.change(toggleAmqpPropertiesInLog);

	// The RabbitMQ broker expects the userId property to match the username.
	// This doesn't cause any harm for other brokers, so explictly make them
	// the same for best chance of success.
	propUserId.val(username.val());

	routingKey = "broadcastkey";
	txnRoutingKey = "txnBroadcastKey";

	receivedMessageCounter = 0;

	// Dynamically create the priority property poplist.
	for (var i = 0; i < 10; i++) {
		propPriority
			.append($("<option></option>")
				.attr("value", i)
				.text(i));
	}
	// Set the default priority.
	propPriority.find('option[value="6"]').attr("selected", true);


	url.val("wss://demos.kaazing.com/amqp");

	// Pick a random starting point for the counter, to minimize collisions
	// with other demo clients.
	messageIdCounter = getRandomInt(1, 100000);

	// As a convenience, connect when the user presses Enter
	// if no fields have focus, and we're not currently connected.
	$(window).keypress(function (e) {
		if (e.keyCode == 13) {
			if (e.target.nodeName == "BODY" && url.prop("disabled") == false) {
				handleConnect();
			}
		}
	});

	// As a convenience, connect when the user presses Enter
	// in the location field.
	$('#url').keypress(function (e) {
		if (e.keyCode == 13) {
			handleConnect();
		}
	});

	// As a convenience, send as text when the user presses Enter
	// in the message field.
	$('#consumeMessage').keypress(function (e) {
		if (e.keyCode == 13) {
			handleSend();
		}
	});

	// Add trim() to string, if not present.
	if (!String.prototype.trim) {
		String.prototype.trim = function () {
			// Make sure we trim BOM and NBSP
			rtrim = /^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g;
			return this.replace(rtrim, "");
		}
	}

	amqpClientFactory = new AmqpClientFactory();

	// Creating the WebSocketFactory once and decorating it as desired lets
	// you reuse it for multiple AMQP clients.
	var webSocketFactory = createWebSocketFactory();
	amqpClientFactory.setWebSocketFactory(webSocketFactory);

	updateGuiState();

});

// Event handler when the user clicks the Connect button to establish a connection
// to Kaazing Gateway.
//
var handleConnect = function () {
	connectBut.prop("disabled", true);
	log("CONNECTING: " + url.val() + " " + username.val());

	queueName = "client" + Math.floor(Math.random() * 1000000);
	txnQueueName = "txnclient" + Math.floor(Math.random() * 1000000);
	myConsumerTag = "client" + Math.floor(Math.random() * 1000000);
	myTxnConsumerTag = "txnclient" + Math.floor(Math.random() * 1000000);

	amqpClient = amqpClientFactory.createAmqpClient();

	amqpClient.addEventListener("close", function () {
		log("DISCONNECTED");
		updateGuiState();
	});

	amqpClient.addEventListener("error", function (e) {
		log("CONNECTION ERROR:" + e.message);
		connectBut.prop("disabled", false);
	});

	var credentials = {username: username.val(), password: password.val()};
	var options = {
		url: url.val(),
		virtualHost: virtualhost.val(),
		credentials: credentials
	};
	amqpClient.connect(options, openHandler);
}

// Event handler invoked when the connection is successfully made.
//
var openHandler = function () {
	log("CONNECTED");

	log("OPEN: Publish Channel");
	publishChannel = amqpClient.openChannel(publishChannelOpenHandler);

	log("OPEN: Consume Channel");
	consumeChannel = amqpClient.openChannel(consumeChannelOpenHandler);

	txnPublishChannel = amqpClient.openChannel(txnPublishChannelOpenHandler);
	txnConsumeChannel = amqpClient.openChannel(txnConsumeChannelOpenHandler);
};

// Event handler when the publish channel is opened.
//
var publishChannelOpenHandler = function (channel) {
	log("OPENED: Publish Channel");

	publishChannel.declareExchange({exchange: consumeExchange.val(), type: "fanout"});

	// Listen for these requests to return
	publishChannel.addEventListener("declareexchange", function () {
		log("EXCHANGE DECLARED: " + consumeExchange.val());
	});

	publishChannel.addEventListener("error", function (e) {
		log("CHANNEL ERROR: Publish Channel - " + e.message);
	});

	publishChannel.addEventListener("close", function () {
		log("CHANNEL CLOSED: Publish Channel");
	});

	updateGuiState(true);

};

// Event handler when the consume channel is opened.
//
var consumeChannelOpenHandler = function (channel) {
	log("OPENED: Consume Channel");

	consumeChannel.addEventListener("declarequeue", function () {
		log("QUEUE DECLARED: " + queueName);
	});

	consumeChannel.addEventListener("bindqueue", function () {
		log("QUEUE BOUND: " + consumeExchange.val() + " - " + queueName);
	});

	consumeChannel.addEventListener("consume", function () {
		log("CONSUME FROM QUEUE: " + queueName);
	});

	consumeChannel.addEventListener("flow", function (e) {
		log("FLOW: " + (e.args.active ? "ON" : "OFF"));
	});

	consumeChannel.addEventListener("close", function () {
		log("CHANNEL CLOSED: Consume Channel");
	});

	consumeChannel.addEventListener("message", function (message) {
		handleMessageReceived(message);
	});

	// The default value for noAck is true. Passing a false value for 'noAck' in
	// the AmqpChannel.consumeBasic() function means there should be be explicit
	// acknowledgement when the message is received. If set to true, then no
	// explicit acknowledgement is required when the message is received.
	consumeChannel.declareQueue({queue: queueName})
		.bindQueue({queue: queueName, exchange: consumeExchange.val(), routingKey: routingKey})
		.consumeBasic({queue: queueName, consumerTag: myConsumerTag, noAck: false});
};

// Event handler when the transactional publish channel is opened.
//
var txnPublishChannelOpenHandler = function (channel) {
	txnPublishChannel.declareExchange({exchange: txExchange.val(), type: "fanout"});

	// listen for these requests to return
	txnPublishChannel.addEventListener("selecttransaction", function () {
		log("TXN SELECTED/STARTED");
	});

	txnPublishChannel.addEventListener("committransaction", function () {
		log("TXN COMMITTED");
	});

	txnPublishChannel.addEventListener("rollbacktransaction", function () {
		log("TXN ROLLED BACK");
	});
};

// Event handler when the transactional consume channel is opened.
//
var txnConsumeChannelOpenHandler = function (channel) {
	txnConsumeChannel.addEventListener("message", function (message) {
		handleMessageReceived(message);
	});

	// The default value for noAck is true. Passing a false value for 'noAck' in
	// the AmqpChannel.consumeBasic() function means there should be be explicit
	// acknowledgement when the message is received. If set to true, then no
	// explicit acknowledgement is required when the message is received.
	txnConsumeChannel.declareQueue({queue: txnQueueName})
		.bindQueue({queue: txnQueueName, exchange: txExchange.val(), routingKey: txnRoutingKey})
		.consumeBasic({queue: txnQueueName, consumerTag: myTxnConsumerTag, noAck: false});
};

// Event handler when the disconnect button is pressed.
//
var handleDisconnect = function () {
	log("DISCONNECT");
	amqpClient.disconnect();
	updateGuiState();
}

// Event handler when the publish button is pressed.
//
var handleSend = function () {
	doSend(publishChannel, consumeExchange.val(), routingKey, consumeMessage.val(), "MESSAGE PUBLISHED: ", "sendMessage");
}

// Event handler when the user presses the show/hide AMQP properties button.
//
var handlePropertiesToggle = function () {
	propertiesDivContent.toggle(200, function () {
		var linkText = "Show";
		if (propertiesDivContent.is(":visible")) {
			linkText = "Hide";
			propertiesToggle.removeClass("infoHidden");
			propertiesToggle.addClass("infoDisplayed");
		} else {
			propertiesToggle.removeClass("infoDisplayed");
			propertiesToggle.addClass("infoHidden");
		}
		propertiesToggle.text(linkText);
	});
}

// Event handler when the user presses the show/hide custom headers button.
//
var handleHeadersToggle = function () {
	headersDivContent.toggle(200, function () {
		var linkText = "Show";
		if (headersDivContent.is(":visible")) {
			linkText = "Hide";
			headersToggle.removeClass("infoHidden");
			headersToggle.addClass("infoDisplayed");
		} else {
			headersToggle.removeClass("infoDisplayed");
			headersToggle.addClass("infoHidden");
		}
		headersToggle.text(linkText);
	});
}

// Event handler when the user presses the Flow On button.
//
var handleFlowOn = function () {
	consumeChannel.flowChannel(true);
}

// Event handler when the user presses the Flow Off button.
//
var handleFlowOff = function () {
	consumeChannel.flowChannel(false);
}

// Event handler when the user presses the transactional Select button.
//
var handleSelect = function () {
	txnPublishChannel.selectTx(function () {
		log("TXN SELECT");
		updateGuiState(true, true);
	});
}

// Event handler when the user presses the transactional Commit button.
//
var handleCommit = function () {
	txnPublishChannel.commitTx(function () {
		log("TXN COMMIT");
		updateGuiState(true, false);
	});
}

// Event handler when the user presses the transactional Publish button.
//
var handleTxSend = function () {
	doSend(txnPublishChannel, txExchange.val(), txnRoutingKey, txMessage.val(), "TXN MESSAGE PUBLISHED: ", "txSendMessage");
}

// Event handler when the user presses the transactional Rollback button.
//
var handleRollback = function () {
	txnPublishChannel.rollbackTx(function () {
		log("TXN ROLLBACK");
		updateGuiState(true, false);
	});
}

// Event handler when a message has been received from the gateway.
//
var handleMessageReceived = function (event) {

	receivedMessageCount.text(++receivedMessageCounter);

	var body = null;

	// Check how the payload was packaged since older browsers like IE7 don't
	// support ArrayBuffer. In those cases, a Kaazing ByteBuffer was used instead.
	if (typeof(ArrayBuffer) === "undefined") {
		body = event.getBodyAsByteBuffer().getString(Charset.UTF8);
	}
	else {
		body = arrayBufferToString(event.getBodyAsArrayBuffer())
	}
	var props = event.properties;
	var exchange = event.args.exchange;
	var routingKey = event.args.routingKey;
	var dt = event.args.deliveryTag;
	var channel = event.target;
	logMessageDiv("MESSAGE CONSUMED: ", "receiveMessage", body, props, exchange, routingKey);

	// Acknowledge the message as we passed in a false for 'noAck' in the
	// AmqpChannel.consumeBasic() call. If the message is not acknowledged,
	// the broker will keep holding the message. And, as more and more
	// messages are held by the broker, it will eventually result in
	// an out of memory error.
	var config = {deliveryTag: dt, multiple: true};
	setTimeout(function () {
		// Acknowledging is a synchronous call with a roundtrip to the server,
		// therefore schedule it independently so as not to block current
		// execution.
		channel.ackBasic(config);
	}, 0);
}

// Create a WebSocketFactory which can be used for multiple AMQP clients if
// required. This lets you defined the attributes of a WebSocket connection
// just once – such as a ChallengeHandler – and reuse it.
//
var createWebSocketFactory = function () {
	webSocketFactory = new WebSocketFactory();

	// Add a BasicChallengeHandler in case the service has enabled basic authentication.
	var basicHandler = new BasicChallengeHandler();
	basicHandler.loginHandler = function (callback) {
		popupLoginDialog(callback);
	}
	webSocketFactory.setChallengeHandler(basicHandler);
	return webSocketFactory;
}

// Event handler when the user presses the clear log button.
//
var handleClearLog = function () {
	logConsole.empty();
}

// Toggle the display of AMQP properties in the log console pane.
//
var toggleAmqpPropertiesInLog = function () {
	$('div.properties').toggleClass('hidden', !toggleAmqpPropsCb.is(':checked'));
}

// Log a string message to the log console pane.
//
var log = function (message) {
	var div = $('<div>');
	div.addClass("logMessage");
	div.html(message);
	logDiv(div);
}

// Write a div that's in the correct form to the log console pane.
//
var logDiv = function (div) {
	logConsole.append(div);

	// Hide the headers of new messages, if that's what the user specified.
	toggleAmqpPropertiesInLog();

	// Make sure the last line is visible.
	logConsole.scrollTop(logConsole[0].scrollHeight);

	// Only keep the most recent few rows so the log doesn't grow out of control.
	while (logConsole.children().length > 40) {
		// Delete two rows to preserve the alternate background colors.
		logConsole.children().first().remove();
		logConsole.children().first().remove();
	}
}

// Convert a string to an ArrayBuffer.
//
var stringToArrayBuffer = function (str) {
	var buf = new ArrayBuffer(str.length);
	var bufView = new Uint8Array(buf);
	for (var i = 0, strLen = str.length; i < strLen; i++) {
		bufView[i] = str.charCodeAt(i);
	}
	return buf;
}

// Convert an ArrayBuffer to a string.
//
var arrayBufferToString = function (buf) {
	return String.fromCharCode.apply(null, new Uint8Array(buf));
}


// Returns a random integer between min (inclusive) and max (exclusive).
//
function getRandomInt(min, max) {
	return Math.floor(Math.random() * (max - min)) + min;
}

// Enable or disable fields on the screen based on whether we are currently
// connected or not.
//
// @param connected (boolean)
// Specify if the application is currently connected. If not set, will default
// to false.
//
// @param transacted (boolean)
// Specify whether a transaction is beginning or ending.  If not set, will
// default to false.
//
var updateGuiState = function (connected, transacted) {

	if (connected === undefined) {
		connected = false;
	}

	if (transacted === undefined) {
		transacted = false;
	}

	url.prop("disabled", connected);
	username.prop("disabled", connected);
	password.prop("disabled", connected);
	virtualhost.prop("disabled", connected);
	connectBut.prop("disabled", connected);
	disconnectBut.prop("disabled", !connected);

	propAppId.prop("disabled", !connected);
	propContentEncoding.prop("disabled", !connected);
	propContentType.prop("disabled", !connected);
	propCorrelationId.prop("disabled", !connected);
	propDeliveryMode.prop("disabled", !connected);
	propExpiration.prop("disabled", !connected);
	propMessageId.prop("disabled", !connected);
	propPriority.prop("disabled", !connected);
	propReplyTo.prop("disabled", !connected);
	propTimestamp.prop("disabled", !connected);
	propType.prop("disabled", !connected);
	propUserId.prop("disabled", !connected);

	headerName1.prop("disabled", !connected);
	headerType1.prop("disabled", !connected);
	headerValue1.prop("disabled", !connected);
	headerName2.prop("disabled", !connected);
	headerType2.prop("disabled", !connected);
	headerValue2.prop("disabled", !connected);

	consumeExchange.prop("disabled", !connected);
	consumeMessage.prop("disabled", !connected);
	sendBut.prop("disabled", !connected);
	flowOnBut.prop("disabled", !connected);
	flowOffBut.prop("disabled", !connected);

	txExchange.prop("disabled", !connected);
	txMessage.prop("disabled", !connected);

	if (connected) {
		selectBut.prop("disabled", transacted);
		txSendBut.prop("disabled", !transacted);
		commitBut.prop("disabled", !transacted);
		rollbackBut.prop("disabled", !transacted);
	} else {
		selectBut.prop("disabled", !connected);
		txSendBut.prop("disabled", !connected);
		commitBut.prop("disabled", !connected);
		rollbackBut.prop("disabled", !connected);
	}
}

// Add the AMQP properties to the given props object.
//
var addProperties = function (props) {
	var prop;

	prop = propAppId.val().trim();
	if (prop !== undefined && prop.length > 0) {
		props.setAppId(prop);
	}

	prop = propContentType.val().trim();
	if (prop !== undefined && prop.length > 0) {
		props.setContentType(prop);
	}

	prop = propContentEncoding.val().trim();
	if (prop !== undefined && prop.length > 0) {
		props.setContentEncoding(prop);
	}

	prop = propCorrelationId.val().trim();
	if (prop !== undefined && prop.length > 0) {
		props.setCorrelationId(prop);
	}

	prop = propCorrelationId.val().trim();
	if (prop !== undefined && prop.length > 0) {
		props.setCorrelationId(prop);
	}

	prop = propDeliveryMode.val().trim();
	props.setDeliveryMode(prop);

	prop = propExpiration.val().trim();
	if (prop !== undefined && prop.length > 0) {
		props.setExpiration(prop);
	}

	prop = propMessageId.prop('checked');
	if (prop) {
		props.setMessageId((messageIdCounter++).toString());
	}

	prop = propPriority.val().trim();
	props.setPriority(prop);

	prop = propReplyTo.val().trim();
	if (prop !== undefined && prop.length > 0) {
		props.setReplyTo(prop);
	}

	prop = propTimestamp.prop('checked');
	if (prop) {
		props.setTimestamp(new Date());
	}

	prop = propType.val().trim();
	if (prop !== undefined && prop.length > 0) {
		props.setType(prop);
	}

	prop = propUserId.val().trim();
	if (prop !== undefined && prop.length > 0) {
		props.setUserId(prop);
	}

}

// Add a header to the customHeaders object.
//
// @param customHeaders (Object)
// An object holding the custom headers, to which the new one will be added.
//
// @param headerName (String)
// The name of the new header to be added.
//
// @param headerType (String)
// The type of the new header to be added. Valid values are "int" or "String".
//
// @param headerValue (String)
// The value of the new header to be added.
//
var addCustomerHeaders = function (customHeaders, headerName, headerType, headerValue) {
	if (headerName !== undefined && headerName.length > 0) {
		switch (headerType) {
			case "int":
				customHeaders.addInteger(headerName, headerValue);
				break;
			case "String":
				customHeaders.addLongString(headerName, headerValue);
				break;
		}
	}
}

// Publish a message. Can be a transacted or non-transacted message.
//
// @param logText (String)
// The prefix to write in the log message pane.
//
// @param className (String)
// The class to use in the log message pane, since transacted messages are
// drawn in a different color.
//
var doSend = function (channel, exchangeName, routeKey, messageText, logText, className) {

	if (messageText == null || messageText.length == 0) {
		alert("Enter a valid string for message");
		return;
	}

	var body = null;

	// Older browsers like IE6 or IE7 don't support ArrayBuffer, therefore
	// the package the using a Kaazing ByteBuffer.
	if (typeof(ArrayBuffer) === "undefined") {
		body = new ByteBuffer();
		body.putString(messageText, Charset.UTF8);
		body.flip();
	}
	else {
		body = stringToArrayBuffer(messageText);
	}

	var props = new AmqpProperties();

	addProperties(props);

	var customHeaders = new AmqpArguments();

	addCustomerHeaders(customHeaders, headerName1.val().trim(), headerType1.val(), headerValue1.val().trim());
	addCustomerHeaders(customHeaders, headerName2.val().trim(), headerType2.val(), headerValue2.val().trim());

	props.setHeaders(customHeaders);

	logMessageDiv(logText, className, messageText, props, exchangeName, routeKey);

	channel.publishBasic({body: body, properties: props, exchange: exchangeName, routingKey: routeKey});
}

// Create a row in a message div with the correct format.
//
var buildLogMessageRow = function (name, value) {
	var row = $('<tr>')
	row.append('<td>' + name + ':</td>');
	var v1 = value;
	if (v1 === undefined) {
		v1 = "-";
	}
	row.append('<td>' + v1 + '</td>');
	return row;
}

// Create a div that can be displayed in the log message pane which shows a
// message and its details.
//
var logMessageDiv = function (text, divClass, body, props, exchange, routingKey) {
	var messageDiv = $('<div>');
	messageDiv.addClass(divClass);
	messageDiv.text(text + body);

	var table;
	var tbody;

	// Add the message information.
	var destinationDiv = $('<div>');
	destinationDiv.addClass("destination");
	table = $('<table>');
	destinationDiv.append(table);
	tbody = $('<tbody>');
	table.append(tbody);
	tbody.append(buildLogMessageRow("Exchange", exchange));
	tbody.append(buildLogMessageRow("Routing Key", routingKey));
	messageDiv.append(destinationDiv);

	if (props != null) {

		// Add the custom headers.
		var headers = props.getHeaders();
		if (headers != null || headers.length > 0) {
			var headersDiv = $('<div>');
			headersDiv.addClass("headers");
			table = $('<table>');
			headersDiv.append(table);
			tbody = $('<tbody>');
			table.append(tbody);
			for (var i = 0; i < headers.length; i++) {
				var h = headers[i];
				tbody.append(buildLogMessageRow(h.key, h.value + " <em>(" + h.type + ")</em>"));
			}
			messageDiv.append(headersDiv);
		}

		// Add the properties.
		var propertiesDiv = $('<div>');
		propertiesDiv.addClass("properties");
		table = $('<table>');
		propertiesDiv.append(table);
		tbody = $('<tbody>');
		table.append(tbody);
		tbody.append(buildLogMessageRow("appId", props.getAppId()));
		tbody.append(buildLogMessageRow("contentEncoding", props.getContentEncoding()));
		tbody.append(buildLogMessageRow("contentType", props.getContentType()));
		tbody.append(buildLogMessageRow("correlationId", props.getCorrelationId()));
		var deliveryMode;
		if (props.getDeliveryMode() === 1) {
			deliveryMode = "1 <em>(Non-persistent)</em>";
		} else if (props.getDeliveryMode() === 2) {
			deliveryMode = "2 <em>(Persistent)</em>";
		} else {
			deliveryMode = props.getDeliveryMode();
		}
		tbody.append(buildLogMessageRow("deliveryMode", deliveryMode));
		tbody.append(buildLogMessageRow("expiration", props.getExpiration()));
		tbody.append(buildLogMessageRow("messageId", props.getMessageId()));
		tbody.append(buildLogMessageRow("priority", props.getPriority()));
		tbody.append(buildLogMessageRow("replyTo", props.getReplyTo()));
		tbody.append(buildLogMessageRow("timestamp", props.getTimestamp()));
		tbody.append(buildLogMessageRow("type", props.getType()));
		tbody.append(buildLogMessageRow("userId", props.getUserId()));
		messageDiv.append(propertiesDiv);
	}

	logDiv(messageDiv);
}

// If a basic challenge is received by the client, then display a username and
// password box to let the user enter credentials.
//
var popupLoginDialog = function (callback) {

	var popup = document.getElementById("logindiv");
	$("#logindiv").slideToggle(300);
	var login = document.getElementById("sso_login");
	var cancel = document.getElementById("sso_cancel");

	$('#sso_username').focus();

	// As a convenience, connect when the user presses Enter in the location
	// field.
	$('#sso_password').keypress(function (e) {
		if (e.keyCode == 13) {
			e.stopImmediatePropagation(); // Prevent firing twice.
			login.click();
		}
	});

	// Event handler for when the "OK" button is clicked.
	login.onclick = function () {
		var credentials = new PasswordAuthentication(ssoUsername.val(), ssoPassword.val());

		// Hide the popup.
		$("#logindiv").slideToggle(100);

		// Clear the password.
		ssoPassword.val("");

		callback(credentials);
	}

	// Event handler for when the "Cancel" button is clicked.
	cancel.onclick = function () {
		// Hide the popup.
		$("#logindiv").slideToggle(100);

		// Clear the password.
		ssoPassword.val("");

		// Pass null to the callback to stop authentication.
		callback(null);
	}
}
