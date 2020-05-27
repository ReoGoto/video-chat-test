'use strict';

const nameInput = document.getElementById( 'nameInput' )
const keywordInput = document.getElementById( 'keywordInput' )
const localV = document.getElementById( "localVideo" )
const remoteV = [
	document.getElementById( "remoteVideo_1" ),
	document.getElementById( "remoteVideo_2" ),
	document.getElementById( "remoteVideo_3" )
]

const connectButton = document.getElementById( 'connectButton' )
const disconnectButton = document.getElementById( 'disconnectButton' )

connectButton.addEventListener('click', ()=> {
	const chat = new VideoChat( nameInput.value, keywordInput.value, localV, remoteV, true )
	chat.start()
})

disconnectButton.addEventListener( "click", () => {
	disconnectButton.disabled = true
	connectButton.disabled = false
	location.reload()
} )


class VideoChat{
	constructor(username, keyword, localVideo, remoteVideo, p2p){
		this.username = username
		this.keyword = keyword
		this.localVideo = localVideo
		this.remoteVideo = remoteVideo // array
		if( p2p === false){
			this.type = "SFU"
			this.peer = new WebRTCConn_SFU( this.username, this.localVideo, this.remoteVideo)
			this.conn = new SocketConn_SFU( this.peer )
		}else{
			this.type = "P2P"
			this.peer = new WebRTCConn_P2P( this.username, this.localVideo, this.remoteVideo )
			this.conn = new SocketConn_P2P( this.peer )
		}
	}

	start(){
		if( this.type === "P2P"){
			this.conn.connect( this.keyword )
		}else{
			this.conn.connect( this.keyword )
		}
	}

} ////         ------------ end of VidoeChat Class ---------------------------

class WebRTCConn_P2P {

	constructor ( name, localVideo, remoteVideo ) {
		this.constrains = {
			iceServers: [ { urls: 'stun:stun.l.google.com:19302' } ]
		}

		this.name = name
		this.myStream = null
		this.pc = [
			new RTCPeerConnection( this.constrains ),
			new RTCPeerConnection( this.constrains ),
			new RTCPeerConnection( this.constrains )
		]
		this.peerName = [ null, null, null ]
		this.localVideo = localVideo
		this.remoteVideo = remoteVideo
	}

	startCamera () {
		console.log( "camera starts" )
		const medias = {
			audio: true,
			video: { facingMode: "user" }  // フロントカメラにアクセス
		};

		if ( navigator.mediaDevices === undefined ) {
			navigator.mediaDevices = {};
		}

		if ( navigator.mediaDevices.getUserMedia === undefined ) {
			return new Promise( ( resolve, reject ) => {
				navigator.getUserMedia( medias, stream => {
					this.myStream = stream
					this.localVideo.srcObject = stream
					resolve()
				}, () => {
					reject()
				} )
			} )
		}

		return navigator.mediaDevices.getUserMedia( medias )
			.then( ( mediaStream ) => {
				this.myStream = mediaStream
				this.localVideo.srcObject = mediaStream;
			} )
	}

	createOffer () {
		for ( var i = 0; i < this.pc.length; i++ ) {
			if ( this.pc[ i ].connectionState != "connected"  ) {
				return new Promise( ( resolve, reject ) => {

					this._prepareOffer( this.pc[ i ] )
					this._addStream( this.pc[ i ], this.myStream)
					this._getRemoteVideo( this.pc[ i ], this.remoteVideo[ i ])
					this._sendSDP( this.pc[ i ] ).then( ( sdp ) => {
						resolve( sdp )
					} ).catch( () => {
						return;
					} )

					this.pc[ i ].addEventListener('connectionstatechange', ()=>{
						switch( this.pc[ i ].connectionState){
							case "failed":
							case "disconnected":
							case "closed":
								this.pc[ i ].close()
								this.pc[ i ] = null
								this.pc[ i ] = new RTCPeerConnection( this.constrains )
								this.peerName[ i ] = null
								this.remoteVideo[ i ].srcObject = null
								reject()
								break;
						}
					})

				} )
			}
		}
	}


	createAnswer ( offerSdpText, peerName ) {
		for ( var i = 0; i < this.pc.length; i++ ) {
			if ( this.pc[ i ].connectionState != "connected" ) {
				return new Promise( ( resolve, reject ) => {

					if ( this.pc[ i ] ) {
						this.pc[ i ].close()
						this.pc[ i ] = null
						this.pc[ i ] = new RTCPeerConnection( this.constrains )
						this.peerName[ i ] = null
					}

					this.peerName[ i ] = peerName

					this._addStream( this.pc[ i ], this.myStream )
					this._getRemoteVideo( this.pc[ i ], this.remoteVideo[ i ] )
					this._sendSDP( this.pc[ i ] ).then( ( sdp ) => {
						resolve( sdp )
					} ).catch( () => {
						return;
					} )

					const offerSdp = new RTCSessionDescription( {
						type: 'offer',
						sdp: offerSdpText
					} )

					this.pc[ i ].addEventListener( 'connectionstatechange', () => {
						switch ( this.pc[ i ].connectionState ) {
							case "failed":
							case "disconnected":
							case "closed":
								this.pc[ i ].close()
								this.pc[ i ] = null
								this.pc[ i ] = new RTCPeerConnection( this.constrains )
								this.peerName[ i ]
								this.remoteVideo[ i ].srcObject = null
								reject()
								break;
						}
					} )

					this.pc[ i ].setRemoteDescription( offerSdp ).then( () => {
						this.pc[ i ].createAnswer().then( answerSdp => {
							this.pc[ i ].setLocalDescription( answerSdp )
						} )
					} ).catch( () => {
						this.peerName[ i ] = null
						reject()
					} )

				} )
			}
		}
	}


	setAnswer ( answerSdpText, peerName ) {
		for ( var i = 0; i < this.pc.length; i++ ) {
			if ( this.pc[ i ].connectionState != "connected" ) {
				return new Promise( ( resolve, reject ) => {

					const answerSdp = new RTCSessionDescription( {
						type: 'answer',
						sdp: answerSdpText
					} )

					this.peerName[ i ] = peerName

					this.pc[ i ].addEventListener( 'connectionstatechange', () => {
						switch ( this.pc[ i ].connectionState ) {
							case "connected":
								resolve()
								break;
						}
					} )

					this.pc[ i ].setRemoteDescription( answerSdp ).then( () => {

					} ).catch( ( err ) => {
						this.pc[ i ].close()
						this.pc[ i ] = null
						this.pc[ i ] = new RTCPeerConnection( this.constrains )
						this.peerName[ i ]
						reject( err )
					} )
				} )
			}
		}
	}

	_sendSDP( pc ){
		return new Promise( ( resolve, reject ) => {
			pc.addEventListener( 'icecandidate', ev => {
				if ( ev.candidate ) {
					const offerSdp = ev.currentTarget.localDescription.sdp
					resolve( offerSdp )
				} else {
					reject( )
				}
			})
		})
	}

	_addStream ( pc, localStream ) {
		localStream.getTracks().forEach( track => {
			pc.addTrack( track, localStream )
		} );
	}

	_prepareOffer ( pc ) {
		pc.addEventListener( 'negotiationneeded', () => {
			pc.createOffer().then( offerSdp => {
				pc.setLocalDescription( offerSdp )
			} )
		})
	}

	_getRemoteVideo ( pc, video ) {
		pc.addEventListener( 'track', ev => {
			for ( var i = 0; i < ev.streams.length; i++ ) {
				video.srcObject = ev.streams[ i ]
			}
		} )
	}

}  //====================================================


class SocketConn_P2P {

	constructor ( webRTCConn ) {
		this.conn = null
		this.peer = webRTCConn
		this.list = [null, null, null]
		this.currentPartner = null

		this.REQUEST_NAME = 'requestName'
		this.SEND_NAME = 'sendName'
		this.CREATE_OFFER = 'createOffer'
		this.CREATE_ANSWER = 'createAnswer'
		this.SET_ANSWER = 'setAnswer'
	}

	_buildConnectionUrl ( keyword ) {
		const loc = window.location
		let uri = 'ws:'
		if ( loc.protocol === 'https:' ) {
			uri = 'wss:'
		}
		uri += '//' + loc.host
		uri += loc.pathname + 'ws/' + keyword
		return uri
	}

	_sendObj ( obj ) {
		this.conn.send( JSON.stringify( obj ) )
	}

	connect ( keyword ) {

		this.peer.startCamera().then( () => {
			const ws = this.conn = new WebSocket( this._buildConnectionUrl( keyword ) )

			ws.addEventListener( 'open', () => {
					console.log( "REQUEST NAME" )
					this._sendObj( {
						type: this.REQUEST_NAME,
						data: "",
						name: this.peer.name,
						to: ""
					} )
			} )

			ws.addEventListener( 'message', ( evt ) => {
				const message = JSON.parse( evt.data )

				if ( message.name === this.peer.name ) {
					return;
				}

				for ( var i = 0; i < this.peer.pc.length; i++ ) {
					if ( message.name === this.peer.peerName[ i ] && this.peer.pc[ i ].connectionState === "connected" ) {
						if( this.peer.pc[ i ].setRemoteDescription != null){
							return;
						}
					}
				}

				if( message.to != ""){
					if( message.to != this.peer.name ){
						return;
					}
				}

				switch ( message.type ) {
					case this.REQUEST_NAME:
						this._sendObj( {
							type: this.SEND_NAME,
							data: "",
							name: this.peer.name,
							to: message.name
						} )
						break;
					case this.SEND_NAME:
						if( this.currentPartner){
							return;
						}
						this.currentPartner = message.name
						this.peer.createOffer( message.name ).then( ( sdp ) => {
							this._sendObj( {
								type: this.CREATE_OFFER,
								data: sdp,
								name: this.peer.name,
								to: message.name
							} )
						} ).catch( () =>{
							this.currentPartner = null
						})
						break;
					case this.CREATE_OFFER:
						this.peer.createAnswer( message.data, message.name ).then( ( sdp ) => {
							this._sendObj( {
								type: this.CREATE_ANSWER,
								data: sdp,
								name: this.peer.name,
								to: message.name
							} )
						} ).catch( () => {

						} )
						break
					case this.CREATE_ANSWER:
						this.peer.setAnswer( message.data, message.name ).then( ()=>{
							this.currentPartner = null
							this._sendObj( {
								type: this.REQUEST_NAME,
								data: "",
								name: this.peer.name,
								to: ""
							} )
						}).catch( () => {

						} )
						break
				}
			} )
		} )
	}
}
////// =================================================



class WebRTCConn_SFU {

	constructor ( name, localVideo, remoteVideo ) {
		this.constrains = {
			iceServers: [ { urls: 'stun:stun.l.google.com:19302' } ]
		}
		if ( name === "host" ) {
			this.name = name
			this.myStream = null
			this.remoteStream = [ null, null, null ]
			this.peerName = [ null, null, null ]
			this.pc = [
				new RTCPeerConnection( this.constrains ),
				new RTCPeerConnection( this.constrains ),
				new RTCPeerConnection( this.constrains )
			]
			this.pc_send = [
				new RTCPeerConnection( this.constrains ),
				new RTCPeerConnection( this.constrains ),
				new RTCPeerConnection( this.constrains ),
				new RTCPeerConnection( this.constrains ),
				new RTCPeerConnection( this.constrains ),
				new RTCPeerConnection( this.constrains )
			]
			this.localVideo = localVideo
			this.remoteVideo = remoteVideo
		} else {
			this.name = name
			this.myStream = null
			this.pc = new RTCPeerConnection( this.constrains )
			this.pc_recieve = [
				new RTCPeerConnection( this.constrains ),
				new RTCPeerConnection( this.constrains )
			]
			this.localVideo = localVideo
			this.remoteVideo = remoteVideo
		}
	}

	startCamera () {
		console.log( "camera starts" )
		const medias = {
			audio: true,
			video: { facingMode: "user" }  // フロントカメラにアクセス
		};

		if ( navigator.mediaDevices === undefined ) {
			navigator.mediaDevices = {};
		}

		if ( navigator.mediaDevices.getUserMedia === undefined ) {
			return new Promise( ( resolve, reject ) => {
				navigator.getUserMedia( medias, stream => {
					this.myStream = stream
					this.localVideo.srcObject = stream
					resolve()
				}, () => {
					reject()
				} )
			} )
		}

		return navigator.mediaDevices.getUserMedia( medias )
			.then( ( mediaStream ) => {
				this.myStream = mediaStream
				this.localVideo.srcObject = mediaStream;
			} )
	}

	createOffer ( peerName ) {
		if ( this.isHost() ) {
			for ( var i = 0; i < this.pc.length; i++ ) {
				if ( this.pc[ i ].connectionState != "connected" ) {
					return new Promise( ( resolve, reject ) => {

						this._addStream( this.pc[ i ], this.myStream )
						this._prepareOffer( this.pc[ i ] )

						this.pc[ i ].addEventListener( 'track', ev => {
							for ( var x = 0; x < ev.streams.length; x++ ) {
								this.remoteVideo[ i ].srcObject = ev.streams[ x ]
							}
						} )

						this.peerName[ i ] = peerName

						this.pc[ i ].addEventListener( 'track', ev => {
							this.remoteStream[ i ] = ev.streams[ 0 ]
						} )

						this.pc[ i ].addEventListener( 'icecandidate', ev => {
							if ( ev.candidate ) {
								const offerSdp = ev.currentTarget.localDescription.sdp
								resolve( [ offerSdp, peerName ] )
							} else {
								return
							}
						} )

						this.pc[ i ].addEventListener( 'connectionstatechange', () => {
							switch ( this.pc[ i ].connectionState ) {
								case "disconnected":
								case "failed":
								case "closed":
									this.pc[ i ].close()
									this.pc[ i ] = null
									this.pc[ i ] = new RTCPeerConnection( this.constrains )
									if ( i === 0 ) {
										this.pc_send[ 0 ].close()
										this.pc_send[ 0 ] = null
										this.pc_send[ 0 ] = new RTCPeerConnection( this.constrains )
										this.pc_send[ 1 ].close()
										this.pc_send[ 1 ] = null
										this.pc_send[ 1 ] = new RTCPeerConnection( this.constrains )
										this.pc_send[ 2 ].close()
										this.pc_send[ 2 ] = null
										this.pc_send[ 2 ] = new RTCPeerConnection( this.constrains )
										this.pc_send[ 4 ].close()
										this.pc_send[ 4 ] = null
										this.pc_send[ 4 ] = new RTCPeerConnection( this.constrains )
									} else if ( i === 1 ) {
										this.pc_send[ 0 ].close()
										this.pc_send[ 0 ] = null
										this.pc_send[ 0 ] = new RTCPeerConnection( this.constrains )
										this.pc_send[ 2 ].close()
										this.pc_send[ 2 ] = null
										this.pc_send[ 2 ] = new RTCPeerConnection( this.constrains )
										this.pc_send[ 3 ].close()
										this.pc_send[ 3 ] = null
										this.pc_send[ 3 ] = new RTCPeerConnection( this.constrains )
										this.pc_send[ 5 ].close()
										this.pc_send[ 5 ] = null
										this.pc_send[ 5 ] = new RTCPeerConnection( this.constrains )
									} else if ( i === 2 ) {
										this.pc_send[ 1 ].close()
										this.pc_send[ 1 ] = null
										this.pc_send[ 1 ] = new RTCPeerConnection( this.constrains )
										this.pc_send[ 3 ].close()
										this.pc_send[ 3 ] = null
										this.pc_send[ 3 ] = new RTCPeerConnection( this.constrains )
										this.pc_send[ 4 ].close()
										this.pc_send[ 4 ] = null
										this.pc_send[ 4 ] = new RTCPeerConnection( this.constrains )
										this.pc_send[ 5 ].close()
										this.pc_send[ 5 ] = null
										this.pc_send[ 5 ] = new RTCPeerConnection( this.constrains )
									}
									this.peerName[ i ] = null
									this.remoteStream[ i ] = null
									break;
							}
						} )
					} )
				}
			}
		}
	}

	createAnswer ( offerSdpText, peerName ) {

		if ( !this.isHost() ) {
			if ( this.pc.connectionState != "connected" ) {
				return new Promise( ( resolve, reject ) => {

					if ( this.pc ) {
						this.pc.close()
						this.pc = null
						this.pc = new RTCPeerConnection( this.constrains )
					}

					this.pc.addEventListener( 'icecandidate', ev => {
						if ( ev.candidate ) {
							const sdp = ev.currentTarget.localDescription.sdp
							resolve( [ sdp, peerName ] )
						}
						return
					} )

					this._addStream( this.pc, this.myStream )

					this.pc.addEventListener( 'track', ev => {
						for ( var x = 0; x < ev.streams.length; x++ ) {
							this.remoteVideo[ 0 ].srcObject = ev.streams[ x ]
						}
					} )

					const offerSdp = new RTCSessionDescription( {
						type: 'offer',
						sdp: offerSdpText
					} )

					this.pc.setRemoteDescription( offerSdp ).then( () => {
						this.pc.createAnswer().then( answerSdp => {
							this.pc.setLocalDescription( answerSdp )
						} )
					} ).catch( () => {

						reject()
					} )

					this.pc.addEventListener( 'connectionstatechange', () => {
						switch ( this.pc.connectionState ) {
							case "disconnected":
							case "failed":
							case "closed":
								this.pc.close()
								this.pc = null
								this.pc = new RTCPeerConnection( this.constrains )
								break;
						}
					} )

				} )
			}
		}
	}

	setAnswer ( answerSdpText, peerName ) {

		if ( this.isHost() ) {
			for ( var i = 0; i < this.pc.length; i++ ) {
				if ( this.pc[ i ].connectionState != "connected" ) {
					return new Promise( ( resolve, reject ) => {
						const answerSdp = new RTCSessionDescription( {
							type: 'answer',
							sdp: answerSdpText
						} )

						this.peerName[ i ] = peerName

						this.pc[ i ].addEventListener( 'connectionstatechange', () => {
							switch ( this.pc[ i ].connectionState ) {
								case "connected":
									resolve()
									break;
							}
						})

						this.pc[ i ].setRemoteDescription( answerSdp ).then( () => {

						} ).catch( ( err ) => {
							alert( "error setting answer" )
							console.log( err )
							this.pc[ i ].close()
							this.pc[ i ] = null
							this.pc[ i ] = new RTCPeerConnection( this.constrains )
							reject( err )
						} )
					} )
				}
			}
		}
		this.setSFU( answerSdpText, peerName )
	}

	createSFU () {
		if ( !this.isHost() ) {
			return;
		}

		var connection = 0
		for ( var i = 0; i < this.pc.length; i++ ) {
			if ( this.pc[ i ].connectionState === "connected" || this.pc[ i ].connectionState === "connecting" ) {
				connection = connection + 1
			}
		}

		for ( var i = 0; i < this.pc_send.length; i++ ) {
			var con_num
			if ( i === 0 || i === 1 ) {
				con_num = 0
			} else if ( i === 2 || i === 3 ) {
				con_num = 1
			} else {
				con_num = 2
			}

			switch ( i ) {
				case 0:
					if ( this.remoteStream[ 1 ] === null ) {
						continue;
					}
					break;
				case 1:
					if ( this.remoteStream[ 2 ] === null ) {
						continue;
					}
					if ( this.pc[ 1 ].connectionState != "connected" && this.pc[ 2 ].connectionState === "connected"){
							continue;
					}
					break;
				case 2:
					if ( this.remoteStream[ 0 ] === null ) {
						continue;
					}
					break;
				case 3:
					if ( this.remoteStream[ 2 ] === null ) {
						continue;
					}
					break;
				case 4:
					if ( this.remoteStream[ 0 ] === null ) {
						continue;
					}
					break;
				case 5:
					if ( this.remoteStream[ 1 ] === null ) {
						continue;
					}
					break;
			}

			if ( !this.pc_send[ i ].localDescription && this.pc[ con_num ].connectionState === "connected" ) {

				return new Promise( ( resolve, reject ) => {
					var toName = ""
					switch ( i ) {
						case 0:
							toName = this.peerName[ 0 ]
							this.remoteStream[ 1 ].getTracks().forEach( track => {
								this.pc_send[ i ].addTrack( track, this.remoteStream[ 1 ] )
							} );
							break;
						case 1:
							toName = this.peerName[ 0 ]
							this.remoteStream[ 2 ].getTracks().forEach( track => {
								this.pc_send[ i ].addTrack( track, this.remoteStream[ 2 ] )
							} );
							break;
						case 2:
							toName = this.peerName[ 1 ]
							this.remoteStream[ 0 ].getTracks().forEach( track => {
								this.pc_send[ i ].addTrack( track, this.remoteStream[ 0 ] )
							} );
							break;
						case 3:
							toName = this.peerName[ 1 ]
							this.remoteStream[ 2 ].getTracks().forEach( track => {
								this.pc_send[ i ].addTrack( track, this.remoteStream[ 2 ] )
							} );
							break;
						case 4:
							toName = this.peerName[ 2 ]
							this.remoteStream[ 0 ].getTracks().forEach( track => {
								this.pc_send[ i ].addTrack( track, this.remoteStream[ 0 ] )
							} );
							break;
						case 5:
							toName = this.peerName[ 2 ]
							this.remoteStream[ 1 ].getTracks().forEach( track => {
								this.pc_send[ i ].addTrack( track, this.remoteStream[ 1 ] )
							} );
							break;
					}

					this.pc_send[ i ].addEventListener( 'negotiationneeded', () => {
						this.pc_send[ i ].createOffer().then( offerSdp => {
							this.pc_send[ i ].setLocalDescription( offerSdp )
						} )
					} )

					this.pc_send[ i ].addEventListener( 'icecandidate', ev => {
						if ( ev.candidate ) {
							const offerSdp = ev.currentTarget.localDescription.sdp
							resolve( [ offerSdp, toName ] )
						} else {
							return
						}
					} )

					this.pc_send[ i ].addEventListener( 'connectionstatechange', () => {
						switch ( this.pc_send[ i ].connectionState ) {
							case "disconnected":
							case "failed":
							case "closed":
								this.pc_send[ i ].close()
								this.pc_send[ i ] = null
								this.pc_send[ i ] = new RTCPeerConnection( this.constrains )
								break;
						}
					} )

				} )
			}
		}
	}

	recieveSFU ( offerSdpText, peerName ) {
		if ( !this.isHost() && this.pc.connectionState == "connected" ) {
			for ( var i = 0; i < this.pc_recieve.length; i++ ) {
				if ( this.pc_recieve[ i ].connectionState != "connected" ) {

					return new Promise( ( resolve, reject ) => {

						if ( this.pc_recieve[ i ] ) {
							this.pc_recieve[ i ].close()
							this.pc_recieve[ i ] = null
							this.pc_recieve[ i ] = new RTCPeerConnection( this.constrains )
						}

						this.pc_recieve[ i ].addEventListener( 'icecandidate', ev => {
							if ( ev.candidate ) {
								const sdp = ev.currentTarget.localDescription.sdp
								resolve( [ sdp, peerName ] )
							}
							return;
						} )

						this.pc_recieve[ i ].addEventListener( 'track', ev => {
							for ( var x = 0; x < ev.streams.length; x++ ) {
								this.remoteVideo[ i + 1 ].srcObject = ev.streams[ x ]
							}
						} )

						const offerSdp = new RTCSessionDescription( {
							type: 'offer',
							sdp: offerSdpText
						} )

						this.pc_recieve[ i ].setRemoteDescription( offerSdp ).then( () => {
							this.pc_recieve[ i ].createAnswer().then( answerSdp => {
								this.pc_recieve[ i ].setLocalDescription( answerSdp )
							} )
						} ).catch( ( err ) => {
							alert( "Fail to set Remote SDP" )
							reject( err )
						} )

						this.pc_recieve[ i ].addEventListener( 'connectionstatechange', () => {
							switch ( this.pc_recieve[ i ].connectionState ) {
								case "disconnected":
								case "failed":
								case "closed":
									this.pc_recieve[ i ].close()
									this.pc_recieve[ i ] = null
									this.pc_recieve[ i ] = new RTCPeerConnection( this.constrains )
									this.remoteVideo[ i + 1 ].srcObject = null
									break;
							}
						} )
					} )
				}
			}
		}
	}


	setSFU ( answerSdpText, peerName ) {

		if ( !this.isHost() ) {
			return;
		}

		var index
		for ( var i = 0; i < this.peerName.length; i++ ) {
			if ( this.peerName[ i ] === peerName ) {
				index = i
				break;
			}
		}

		switch ( index ) {
			case 0:
				if ( this.pc_send[ 0 ].connectionState != "connected" ) {
					index = 0
					break;
				} else if ( this.pc_send[ 1 ].connectionState != "connected" ) {
					index = 1
					break;
				} else {
					return;
				}
			case 1:
				if ( this.pc_send[ 2 ].connectionState != "connected" ) {
					index = 2
					break;
				} else if ( this.pc_send[ 3 ].connectionState != "connected" ) {
					index = 3
					break;
				} else {
					return;
				}
			case 2:
				if ( this.pc_send[ 4 ].connectionState != "connected" ) {
					index = 4
					break;
				} else if ( this.pc_send[ 5 ].connectionState != "connected" ) {
					index = 5
					break;
				} else {
					return;
				}
		}

		return new Promise( ( resolve, reject ) => {
			const answerSdp = new RTCSessionDescription( {
				type: 'answer',
				sdp: answerSdpText
			} )

			this.pc_send[ index ].addEventListener( 'connectionstatechange', () => {
				switch ( this.pc_send[ index ].connectionState ) {
					case "connected":
						resolve()
						break;
				}
			})

			this.pc_send[ index ].setRemoteDescription( answerSdp ).then( () => {

			} ).catch( ( err ) => {
				this.pc_send[ index ].close()
				this.pc_send[ index ] = null
				this.pc_send[ index ] = new RTCPeerConnection( this.constrains )
				reject( err )
			} )
		} )
	}

	isHost () {
		return this.name === "host"
	}

	_addStream ( pc, localStream ) {
		localStream.getTracks().forEach( track => {
			pc.addTrack( track, localStream )
		} );
	}

	_prepareOffer ( pc ) {
		pc.createOffer().then( offerSdp => {
			pc.setLocalDescription( offerSdp )
		} )
	}

	_getRemoteVideo ( pc, video ) {
		pc.addEventListener( 'track', ev => {
			for ( var i = 0; i < ev.streams.length; i++ ) {
				video.srcObject = ev.streams[ i ]
			}
		} )
	}

}

////// =============================


class SocketConn_SFU {

	constructor ( webRTCConn ) {
		this.conn = null
		this.peer = webRTCConn

		this.REQUEST_OFFER = "requestOffer"
		this.CREATE_OFFER = 'createOffer'
		this.CREATE_ANSWER = 'createAnswer'
		this.SET_ANSWER = 'setAnswer'
	}

	_buildConnectionUrl ( keyword ) {
		const loc = window.location
		let uri = 'ws:'
		if ( loc.protocol === 'https:' ) {
			uri = 'wss:'
		}
		uri += '//' + loc.host
		uri += loc.pathname + 'ws/' + keyword
		return uri
	}

	_sendObj ( obj ) {
		this.conn.send( JSON.stringify( obj ) )
	}

	connect ( keyword ) {

		this.peer.startCamera().then( () => {
			const ws = this.conn = new WebSocket( this._buildConnectionUrl( keyword ) )

			ws.addEventListener( 'open', () => {
				if ( !this.peer.isHost() ) {
					this._sendObj( {
						type: this.REQUEST_OFFER,
						data: "",
						name: this.peer.name,
						to: "host"
					} )
				}
			} )

			ws.addEventListener( 'message', ( evt ) => {
				const message = JSON.parse( evt.data )

				if ( message.name === nameInput.value ) {
					return;
				} else if ( nameInput.value != "host" && message.name != "host" ) {
					return;
				} else if ( nameInput.value != message.to ) {
					return;
				}

				switch ( message.type ) {
					case this.REQUEST_OFFER:
						this.peer.createOffer( message.name ).then( ( result ) => {
							this._sendObj( {
								type: this.CREATE_OFFER,
								data: result[ 0 ],
								name: this.peer.name,
								to: message.name
							} )
						} )
						break;
					case this.CREATE_OFFER:
						if ( this.peer.pc.connectionState != "connected" ) {
							this.peer.createAnswer( message.data, message.name ).then( ( result ) => {
								this._sendObj( {
									type: this.CREATE_ANSWER,
									data: result[ 0 ],
									name: this.peer.name,
									to: message.name
								} )
							} ).catch( ( err ) => {
								console.log( err )
							} )
						} else {
							this.peer.recieveSFU( message.data, message.name ).then( ( result ) => {
								this._sendObj( {
									type: this.CREATE_ANSWER,
									data: result[ 0 ],
									name: this.peer.name,
									to: "host"
								} )
							} )
						}
						break
					case this.CREATE_ANSWER:
						var index
						for ( var i = 0; i < this.peer.peerName.length; i++ ) {
							if ( this.peer.peerName[ i ] === message.name ) {
								index = i
							}
						}

						if ( this.peer.pc[ index ].connectionState != "connected" ) {
							this.peer.setAnswer( message.data, message.name ).then( () => {
								this.peer.createSFU().then( ( result ) => {
									this._sendObj( {
										type: this.CREATE_OFFER,
										data: result[ 0 ],
										name: this.peer.name,
										to: result[ 1 ]
									} )
								} )
							} ).catch( ( err ) => {

							} )
						} else {
							this.peer.setSFU( message.data, message.name ).then( () => {
								this.peer.createSFU().then( ( result ) => {
									this._sendObj( {
										type: this.CREATE_OFFER,
										data: result[ 0 ],
										name: this.peer.name,
										to: result[ 1 ]
									} )
								} )
							} ).catch( ( err ) => {

							} )
						}
						break
				}
			} )
		} )
	}

}










