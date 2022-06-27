'use strict';

//Defining some global utility variables
var isChannelReady = false;
var isInitiator = false;
var isStarted = false;
var localStream;
var pc;
var playAudioBool = true;
var imageIndex = 0;
var remoteStream;
var turnReady;
var sendChannel;
var receiveChannel;
//Initialize turn/stun server here
var pcConfig = turnConfig;
const dataChannelReceive = document.querySelector('textarea#dataChannelReceive');

const startButton = document.querySelector('button#startButton');
const stopaudioButton = document.querySelector('button#stopAudioButton');
const sendButton = document.querySelector('button#sendButton');
const closeButton = document.querySelector('button#closeButton');
const dataChannelSend = document.querySelector('textarea#dataChannelSend');

startButton.onclick = createConnection;
sendButton.onclick = sendData;
stopaudioButton.onclick = audioStop;
closeButton.onclick = closeDataChannels;


var localStreamConstraints = {
    audio: true,
    video: true
  };


//Not prompting for room name
var room = 'foo';

// Prompting for room name:
room = prompt('Cancel for QR code or enter your email:');
if (room == 'foo2')
	room = 'arbelsolutions@gmail.com';
if (room === undefined || room === null || room =="")
{
	room = Math.floor((Math.random() * 1999999999) + 1)+ "@gmail.test";
	document.getElementById('qrcode').src = "https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=" + room ;
}
room = room + "kvr4";
//Initializing socket.io
var socket = io.connect();

if (room !== '') {
  socket.emit('create or join', room);
  console.log('Attempted to create or  join room', room);
}

//Defining socket connections for signalling
socket.on('created', function(room) {
  console.log('Created room ' + room);
  isInitiator = true;
});

socket.on('full', function(room) {
  console.log('Room ' + room + ' is full');
});

socket.on('join', function (room){
  console.log('Another peer made a request to join room ' + room);
  console.log('This peer is the initiator of room ' + room + '!');
  isChannelReady = true;
});

socket.on('joined', function(room) {
  console.log('joined: ' + room);
  isChannelReady = true;
});

socket.on('log', function(array) {
  console.log.apply(console, array);
});


//Driver code
socket.on('message', function(message, room) {
    console.log('Client received message:', message,  room);
    if (message === 'got user media') {
      maybeStart();
    } else if (message.type === 'offer') {
      if (!isInitiator && !isStarted) {
        maybeStart();
      }
      pc.setRemoteDescription(new RTCSessionDescription(message));
      doAnswer();
    } else if (message.type === 'answer' && isStarted) {
      pc.setRemoteDescription(new RTCSessionDescription(message));
    } else if (message.type === 'candidate' && isStarted) {
      var candidate = new RTCIceCandidate({
        sdpMLineIndex: message.label,
        candidate: message.candidate
      });
      pc.addIceCandidate(candidate);
    } else if (message === 'bye' && isStarted) {
      handleRemoteHangup();
    }
});
  


//Function to send message in a room
function sendMessage(message, room) {
  console.log('Client sending message: ', message, room);
  socket.emit('message', message, room);
}



//Displaying Local Stream and Remote Stream on webpage
var localVideo = document.querySelector('#localVideo');
var remoteVideo = document.querySelector('#remoteVideo');
console.log("Going to find Local media");
navigator.mediaDevices.getUserMedia(localStreamConstraints)
.then(gotStream)
.catch(function(e) {
  //alert('no camera connected : ' + e.name);
  sendMessage('got user media', room);
  if (isInitiator) {
    maybeStart();
  }
});

//If found local stream
function gotStream(stream) {
  console.log('Adding local stream.');
  localStream = stream;
  localVideo.srcObject = stream;
  sendMessage('got user media', room);
  if (isInitiator) {
    maybeStart();
  }
}


console.log('Getting user media with constraints', localStreamConstraints);

//If initiator, create the peer connection
function maybeStart() {
  console.log('>>>>>>> maybeStart() ', isStarted, localStream, isChannelReady);
  if (!isStarted && isChannelReady) {
    console.log('>>>>>> creating peer connection');
    createPeerConnection();
    if (typeof localStream !== 'undefined' )
		pc.addStream(localStream);
    isStarted = true;
    console.log('isInitiator', isInitiator);
    if (isInitiator) {
      doCall();
    }
  }
}

//Sending bye if user closes the window
window.onbeforeunload = function() {
  sendMessage('bye', room);
}; 


//Creating peer connection
function createPeerConnection() {
  try {
    pc = new RTCPeerConnection(pcConfig, {optional: [{RtpDataChannels: true}]});
	//added 1
	sendChannel = pc.createDataChannel('sendDataChannel');
    pc.onicecandidate = handleIceCandidate;
    pc.onaddstream = handleRemoteStreamAdded;
    pc.onremovestream = handleRemoteStreamRemoved;
    console.log('Created RTCPeerConnnection');
	//Added 2
    pc.ondatachannel = receiveChannelCallback;
  } catch (e) {
    console.log('Failed to create PeerConnection, exception: ' + e.message);
    alert('Cannot create RTCPeerConnection object.');
    return;
  }
}

//Function to handle Ice candidates
function handleIceCandidate(event) {
  console.log('icecandidate event: ', event);
  if (event.candidate) {
    sendMessage({
      type: 'candidate',
      label: event.candidate.sdpMLineIndex,
      id: event.candidate.sdpMid,
      candidate: event.candidate.candidate
    }, room);
  } else {
    console.log('End of candidates.');
  }
}

function handleCreateOfferError(event) {
  console.log('createOffer() error: ', event);
}

function doCall() {
  console.log('Sending offer to peer');
  pc.createOffer({
  offerToReceiveAudio: true,
  offerToReceiveVideo: true
}).then(setLocalAndSendMessage, handleCreateOfferError);
}

function doAnswer() {
  console.log('Sending answer to peer.');
  pc.createAnswer().then(
    setLocalAndSendMessage,
    onCreateSessionDescriptionError
  );
}

function setLocalAndSendMessage(sessionDescription) {
  pc.setLocalDescription(sessionDescription);
  console.log('setLocalAndSendMessage sending message', sessionDescription);
  sendMessage(sessionDescription, room);
}

function onCreateSessionDescriptionError(error) {
  trace('Failed to create session description: ' + error.toString());
}


function handleRemoteStreamAdded(event) {
  console.log('Remote stream added.');
  remoteStream = event.stream;
  remoteVideo.srcObject = remoteStream;
}

function handleRemoteStreamRemoved(event) {
  console.log('Remote stream removed. Event: ', event);
}

function hangup() {
  console.log('Hanging up.');
  stop();
  sendMessage('bye',room);
}

function handleRemoteHangup() {
  console.log('Session terminated.');
  stop();
  isInitiator = true;
  isChannelReady = false;
  
}

function stop() {
  isStarted = false;
  pc.close();
  pc = null;
}

function receiveChannelCallback(event) {
  console.log('Receive Channel Callback');
  receiveChannel = event.channel;
  receiveChannel.onmessage = onReceiveMessageCallback;
  receiveChannel.onopen = onReceiveChannelStateChange;
  receiveChannel.onclose = onReceiveChannelStateChange;
}
function onReceiveMessageCallback(event) {
  console.log('Received Message');
  
  console.log(event.data[1]);
  if (event.data[1] === 'c')
  {  
	dataChannelReceive.value = event.data+ "\r\n" +dataChannelReceive.value;
	if (playAudioBool)
	{
		var snd = new Audio("snd/sms.mp3"); // buffers automatically when created
		snd.play();
	}
  }
  else
  {
	  console.log('loading bitmap...');
	
 
	  //var blob = new Blob([event.data], {type: "image/png"});
	//var url = URL.createObjectURL(blob, { oneTimeOnly: true });
	imageIndex++;
	if (imageIndex > 12)
		imageIndex = 1;
	 document.getElementById("image" + imageIndex).src= 'data:image/jpg;base64,' + event.data;
	 document.getElementById("image" + imageIndex).style.visibility="visible";
	 var d = new Date();
	var n = d.toLocaleTimeString();
	document.getElementById("txt" + imageIndex).textContent = n;
	 document.getElementById("txt" + imageIndex).style.visibility="visible";
	 
	  dataChannelReceive.value = "Motion detected:"+n+ "\r\n" +dataChannelReceive.value;
	if (playAudioBool)
	{
		var snd = new Audio("snd/sms.mp3"); // buffers automatically when created
		snd.play();
	}
  }
}

function onSendChannelStateChange() {
  const readyState = sendChannel.readyState;
  console.log('Send channel state is: ' + readyState);
  
}

function onReceiveChannelStateChange() {
  const readyState = receiveChannel.readyState;
  console.log(`Receive channel state is: ${readyState}`);	
  
}

function createConnection() {
	console.log('Create connection - reload imae');
	document.getElementById("image1").src="img/logo.png";
	//var image = document.getElementsByClassName("images#image1");
	//image.src = "img/logo.png";
}

function closeDataChannels() {
}
function sendData() {
  const data = dataChannelSend.value;
  sendChannel.send(data);
  console.log('Sent Data: ' + data);
}
function audioStop(){
	if (playAudioBool)
	{
		playAudioBool = false;
		stopaudioButton.innerText  = "Resume Alarm";
	}
	else{
		playAudioBool = true;
		stopaudioButton.innerText  = "Stop Alarm";
	}
}
