/* eslint-disable no-undef */
require("leaflet");
require("leaflet-edgebuffer");
require("leaflet-geojson-vt");
require("expose-gc");
const { BrowserWindow, shell } = require("@electron/remote");
const { default: turfCircle } = require("@turf/circle");
const { setTimeout, setInterval, clearTimeout, clearInterval } = require("node:timers");
const axios = require("axios");
const bytenode = require("bytenode");
const maplibregl = require("maplibre-gl");

TREM.Audios = {
	pga1   : new Audio("../audio/PGA1.wav"),
	pga2   : new Audio("../audio/PGA2.wav"),
	int0   : new Audio("../audio/Shindo0.wav"),
	int1   : new Audio("../audio/Shindo1.wav"),
	int2   : new Audio("../audio/Shindo2.wav"),
	eew    : new Audio("../audio/EEW.wav"),
	note   : new Audio("../audio/Note.wav"),
	update : new Audio("../audio/Update.wav"),
	areav2 : new Audio("../audio/1/update.wav"),
	palert : new Audio("../audio/palert.wav"),
};
TREM.AudioContext = new AudioContext({});
TREM.Constants = require(path.resolve(__dirname, "../Constants/Constants.js"));
TREM.Earthquake = new EventEmitter();
TREM.EEW = new Map();
TREM.Utils = require(path.resolve(__dirname, "../Utils/Utils.js"));
localStorage.dirname = __dirname;

const speecd_use = setting["audio.tts"] ?? false;

// if (fs.existsSync(path.resolve(__dirname, "../../server.js"))) {
// 	const vm = require("vm");
// 	const v8 = require("v8");
// 	v8.setFlagsFromString("--no-lazy");
// 	const code = fs.readFileSync(path.resolve(__dirname, "../../server.js"), "utf-8");
// 	const script = new vm.Script(code);
// 	const bytecode = script.createCachedData();
// 	fs.writeFileSync(path.resolve(__dirname, "../js/server.jar"), bytecode);
// }
// bytenode.runBytecodeFile(path.resolve(__dirname, "../js/server.jar"));

// #region 變數
const posturl = "https://exptech.com.tw/api/v1/trem/";
const geturl = "https://exptech.com.tw/api/v2/trem/rts?time=";
const getapiurl = "https://api.exptech.com.tw/api/v1/trem/rts";
const MapData = {};
const Timers = {};
let Stamp = 0;
let rts_remove_eew = false;
let UserLocationLat = 25.0421407;
let UserLocationLon = 121.5198716;
let arrive = "";
const audio = { main: [], minor: [], main_lock: false, minor_lock: false };
const EarthquakeList = {};
let marker = null;

/**
 * @type {{main: L.Map, report: maplibregl.Map}}
 */
const Maps = { main: null, mini: null, report: null, intensity: null };

/**
 * @type { {[key: string]: Map<string, maplibregl.StyleLayer>} }
 */
let MapBases = { main: new Map(), mini: new Map(), report: new Map(), intensity: new Map() };
const Station = {};
const detected_box_list = {};
const detected_list = {};
let Cancel = false;
let Canceltime = 0;
let RMT = 1;
let PGALimit = 0;
let PGAtag = -1;
let intensitytag = -1;
let MAXPGA = { pga: 0, station: "NA", level: 0 };
let Info = { Notify: [], Warn: [], Focus: [] };
const Focus = [
	23.608428,
	121.699168,
	7.75,
];
let INFO = [];
let TINFO = 0;
let Report = 0;
let server_timestamp;

try {
	server_timestamp = JSON.parse(fs.readFileSync(path.join(app.getPath("userData"), "server.json")).toString());
} catch (error) {
	server_timestamp = [];
}

let Location;
let station = {};
let palert_geojson = null;
let areav2_geojson = null;
let investigation = false;
let ReportTag = 0;
TREM.IntensityTag1 = 0;
let EEWshot = 0;
let EEWshotC = 0;
let Response = {};
let replay = 0;
let replayT = 0;
let replayD = false;
let replayTemp = 0;
let replaytestEEW = 0;
TREM.toggleNavTime = 0;
let mapLock = false;
let eew = {};
const eewt = { id: 0, time: 0 };
let TSUNAMI = {};
let Ping = "N/A";
let EEWAlert = false;
let PGACancel = false;
let report_get_timestamp = 0;
let map_move_back = false;
TREM.set_report_overview = 0;
let rtstation1 = "";
let MaxIntensity1 = 0;
let testEEWerror = false;
TREM.win = BrowserWindow.fromId(process.env.window * 1);
let stationnow = 0;
let RMTpgaTime = 0;
let type_Unit = "";
let api_key_verify = false;
// #endregion

TREM.Detector = {
	canvas : !!window.CanvasRenderingContext2D,
	webgl  : (function() {
		try {
			const canvas = document.createElement("canvas");
			return !!(window.WebGLRenderingContext && (canvas.getContext("webgl") || canvas.getContext("experimental-webgl")));
		} catch (e) {
			return false;
		}
	})(),
};

TREM.MapIntensity = {
	isTriggered : false,
	alertTime   : 0,
	MaxI        : 0,
	intensities : new Map(),
	description : "",
	palert(rawPalertData) {
		console.log(rawPalertData);

		if (rawPalertData.intensity?.length && !replay) {
			if (rawPalertData.timestamp != this.alertTime) {
				this.alertTime = rawPalertData.timestamp;
				this.MaxI = 0;
				const PLoc = {};
				const int = new Map();

				for (const palertEntry of rawPalertData.intensity) {
					const [countyName, townName] = palertEntry.loc.split(" ");
					const towncode = TREM.Resources.region[countyName]?.[townName]?.code;

					if (!towncode) continue;
					int.set(towncode, palertEntry.intensity);
					PLoc[towncode] = palertEntry.intensity;

					if (palertEntry.intensity > this.MaxI) {
						this.MaxI = palertEntry.intensity;
						Report = rawPalertData.time;
						ipcMain.emit("ReportGET");
					}
				}

				if (setting["webhook.url"] != "" && setting["palert.Notification"]) {
					log("Posting Notification palert Webhook", 1, "Webhook", "palert");
					dump({ level: 0, message: "Posting Notification palert Webhook", origin: "Webhook" });
					this.description = "";
					let intensity_index = 0;

					for (let index = this.MaxI; index != 0; index--) {
						const intensity = `${IntensityI(index)}級`;

						if (rawPalertData.intensity.length != intensity_index)
							this.description += `${intensity.replace("-級", "弱").replace("+級", "強")}\n`;
						let countyName_index = "";

						for (const palertEntry of rawPalertData.intensity) {
							const [countyName, townName] = palertEntry.loc.split(" ");

							if (palertEntry.intensity == index) {
								if (countyName_index == "")
									this.description += `${palertEntry.loc} `;
								else if (countyName_index == countyName)
									this.description += `${townName} `;
								else
									this.description += `\n${palertEntry.loc} `;
								countyName_index = countyName;
								intensity_index += 1;
							}
						}

						this.description += "\n";
					}

					// console.log(this.description);
					const now = timeconvert(new Date(rawPalertData.time)).format("YYYY/MM/DD HH:mm:ss");
					const msg = {
						username   : "TREM | 臺灣即時地震監測",
						avatar_url : "https://raw.githubusercontent.com/ExpTechTW/API/%E4%B8%BB%E8%A6%81%E7%9A%84-(main)/image/Icon/ExpTech.png",
						content    : setting["tts.Notification"] ? ((rawPalertData.final ? "PAlert最終報" : "PAlert") + "時間" + now + "觸發測站" + rawPalertData.tiggered + "台" + this.description) : "PAlert",
						tts        : setting["tts.Notification"],
						embeds     : [
							{
								author: {
									name     : rawPalertData.final ? "PAlert(最終報)" : "PAlert",
									url      : rawPalertData.link,
									icon_url : undefined,
								},
								description : this.description,
								fields      : [
									{
										name   : "時間",
										value  : now,
										inline : true,
									},
									{
										name   : "觸發測站",
										value  : `${rawPalertData.tiggered}台`,
										inline : true,
									},
								],
							},
						],
					};
					fetch(setting["webhook.url"], {
						method  : "POST",
						headers : { "Content-Type": "application/json" },
						body    : JSON.stringify(msg),
					}).catch((error) => {
						log(error, 3, "Webhook", "palert");
						dump({ level: 2, message: error, origin: "Webhook" });
					});
				}

				if (speecd_use && rawPalertData.final) {
					const now = timeconvert(new Date(rawPalertData.time)).format("YYYY/MM/DD HH:mm:ss");
					let intensity_index0 = 0;
					let description0 = "";

					for (let index = this.MaxI; index != 0; index--) {
						const intensity0 = `${IntensityI(index)}級`;
						let countyName_index0 = "";

						for (const palertEntry of rawPalertData.intensity) {
							const [countyName, townName] = palertEntry.loc.split(" ");

							if (palertEntry.intensity == index) {
								if (countyName_index0 == "") {
									description0 += `${countyName} `;

									if (rawPalertData.intensity.length != intensity_index0)
										description0 += `${intensity0.replace("-級", "弱").replace("+級", "強")}\n`;
								} else if (countyName_index0 == countyName) {
									continue;
								} else {
									description0 += `\n${countyName} `;

									if (rawPalertData.intensity.length != intensity_index0)
										description0 += `${intensity0.replace("-級", "弱").replace("+級", "強")}\n`;
								}

								countyName_index0 = countyName;
								intensity_index0 += 1;
							}
						}
					}

					TREM.speech.speak({ text: "震度速報"
					+ "資料來源PAlert(最終報)"
					+ "時間" + now
					+ "觸發測站" + rawPalertData.tiggered + "台震度分布"
					+ description0 });
				}

				if (TREM.Detector.webgl || TREM.MapRenderingEngine == "mapbox-gl") {
					if (this.intensities.size)
						for (const [towncode, intensity] of this.intensities)
							if (int.get(towncode) != intensity) {
								this.intensities.delete(towncode);
								Maps.main.setFeatureState({
									source : "Source_tw_town",
									id     : towncode,
								}, { intensity: 0 });
							}

					if (int.size) {
						log(`Total ${int.size} triggered stations`, 1, "P-Alert", "palert");
						dump({ level: 0, message: `Total ${int.size} triggered stations`, origin: "P-Alert" });

						for (const [towncode, intensity] of int)
							if (this.intensities.get(towncode) != intensity)
								Maps.main.setFeatureState({
									source : "Source_tw_town",
									id     : towncode,
								}, { intensity });

						Maps.main.setLayoutProperty("Layer_intensity_palert", "visibility", "visible");

						this.intensities = int;

						if (!this.isTriggered) {
							this.isTriggered = true;
							changeView("main", "#mainView_btn");

							if (setting["Real-time.show"]) win.showInactive();

							if (setting["Real-time.cover"])
								if (!win.isFullScreen()) {
									win.setAlwaysOnTop(true);
									win.focus();
									win.setAlwaysOnTop(false);
								}

							if (!win.isFocused()) win.flashFrame(true);

							if (setting["audio.PAlert"]) {
								log("Playing Audio > palert", 1, "Audio", "palert");
								dump({ level: 0, message: "Playing Audio > palert", origin: "Audio" });
								TREM.Audios.palert.play();
							}
						}

						setTimeout(() => {
							ipcRenderer.send("screenshotEEW", {
								Function : "palert",
								ID       : 1,
								Version  : 1,
								Time     : NOW().getTime(),
								Shot     : 1,
							});
						}, 1250);
					}
				} else if (!TREM.Detector.webgl || TREM.MapRenderingEngine == "leaflet") {
					if (palert_geojson == null) {
						this.isTriggered = true;
						changeView("main", "#mainView_btn");

						if (setting["Real-time.show"]) win.showInactive();

						if (setting["Real-time.cover"])
							if (!win.isFullScreen()) {
								win.setAlwaysOnTop(true);
								win.focus();
								win.setAlwaysOnTop(false);
							}

						if (!win.isFocused()) win.flashFrame(true);

						if (setting["audio.PAlert"]) {
							log("Playing Audio > palert", 1, "Audio", "palert");
							dump({ level: 0, message: "Playing Audio > palert", origin: "Audio" });
							TREM.Audios.palert.play();
						}
					} else {
						palert_geojson.remove();
					}

					palert_geojson = L.geoJson.vt(MapData.tw_town, {
						minZoom   : 4,
						maxZoom   : 15,
						tolerance : 20,
						buffer    : 256,
						debug     : 0,
						zIndex    : 5,
						style     : (properties) => {
							const name = properties.TOWNCODE;

							if (PLoc[name] == 0 || PLoc[name] == undefined)
								return {
									color       : "transparent",
									weight      : 0,
									opacity     : 0,
									fillColor   : "transparent",
									fillOpacity : 0,
								};
							return {
								color       : TREM.Colors.secondary,
								weight      : 0.8,
								fillColor   : TREM.color(PLoc[name]),
								fillOpacity : 1,
							};
						},
					}).addTo(Maps.main);
					setTimeout(() => {
						ipcRenderer.send("screenshotEEW", {
							Function : "palert",
							ID       : 1,
							Version  : 1,
							Time     : NOW().getTime(),
							Shot     : 1,
						});
					}, 1250);
				}
			}

			if (this.timer)
				this.timer.refresh();
			else
				this.timer = setTimeout(this.clear, 600_000);
		}
	},
	expected(expected) {
		const int = new Map();
		const PLoc = {};

		for (const [towncode, exp] of expected) {
			int.set(towncode, exp.intensity.value);
			PLoc[towncode] = exp.intensity.value;
		}

		if (TREM.Detector.webgl || TREM.MapRenderingEngine == "mapbox-gl") {
			if (this.intensities.size)
				for (const [towncode, intensity] of this.intensities)
					if (int.get(towncode) != intensity) {
						this.intensities.delete(towncode);
						Maps.main.setFeatureState({
							source : "Source_tw_town",
							id     : towncode,
						}, { intensity: 0 });
					}

			if (int.size) {
				for (const [towncode, intensity] of int)
					if (this.intensities.get(towncode) != intensity)
						Maps.main.setFeatureState({
							source : "Source_tw_town",
							id     : towncode,
						}, { intensity });

				Maps.main.setLayoutProperty("Layer_intensity_palert", "visibility", "visible");

				this.intensities = int;
			}
		} else if (!TREM.Detector.webgl || TREM.MapRenderingEngine == "leaflet") {
			if (palert_geojson != null)
				palert_geojson.remove();

			palert_geojson = L.geoJson.vt(MapData.tw_town, {
				minZoom   : 4,
				maxZoom   : 15,
				tolerance : 20,
				buffer    : 256,
				debug     : 0,
				zIndex    : 5,
				style     : (properties) => {
					const name = properties.TOWNCODE;

					if (PLoc[name] == 0 || PLoc[name] == undefined)
						return {
							color       : "transparent",
							weight      : 0,
							opacity     : 0,
							fillColor   : "transparent",
							fillOpacity : 0,
						};
					return {
						color       : TREM.Colors.secondary,
						weight      : 0.8,
						fillColor   : TREM.color(PLoc[name]),
						fillOpacity : 1,
					};
				},
			}).addTo(Maps.main);
		}
	},
	clear() {
		log("Clearing P-Alert map", 1, "P-Alert", "palert");
		dump({ level: 0, message: "Clearing P-Alert map", origin: "P-Alert" });

		this.alertTime = 0;
		this.MaxI = 0;
		this.isTriggered = false;
		this.description = "";

		if (TREM.Detector.webgl || TREM.MapRenderingEngine == "mapbox-gl") {
			if (this.intensities != undefined)
				if (this.intensities.size) {
					Maps.main.removeFeatureState({ source: "Source_tw_town" });
					Maps.main.setLayoutProperty("Layer_intensity_palert", "visibility", "none");
					this.intensities = new Map();

					if (this.timer) {
						clearTimeout(this.timer);
						delete this.timer;
					}
				}
		} else if (!TREM.Detector.webgl || TREM.MapRenderingEngine == "leaflet") {
			if (palert_geojson != null) {
				palert_geojson.remove();
				palert_geojson = null;
			}
		}
	},
};

TREM.PWS = {
	cache: new Map(),
	addPWS(rawPWSData) {
		const id = rawPWSData.link.href.slice(15);

		if (!id.length) return;
		const pws = {
			id,
			title       : rawPWSData.title,
			sender      : rawPWSData.sender.value,
			description : rawPWSData.description.$t,
			area        : rawPWSData.area.areaDesc,
			areaCodes   : TREM.Utils.findRegions(rawPWSData.area.areaDesc),
			sentTime    : new Date(rawPWSData.sent.slice(0, rawPWSData.sent.length - 3)),
			expireTime  : new Date(rawPWSData.expires.slice(0, rawPWSData.expires.length - 3)),
			url         : rawPWSData.link.href,
			timer       : null,
			marker      : {},
			areav2      : {},
		};
		log(`${pws.description}`, 1, "PWS", "addPWS");
		dump({ level: 0, message: `${pws.description}`, origin: "PWS" });

		if (Date.now() > pws.expireTime.getTime()) return;

		let areaconst = 0;

		if (TREM.Detector.webgl || TREM.MapRenderingEngine == "mapbox-gl")
			for (const area of pws.areaCodes)
				if (area.town) {
					const { pws: pwsCount } = Maps.main.getFeatureState({
						source : "Source_tw_town",
						id     : area.code,
					});
					Maps.main.setFeatureState({
						source : "Source_tw_town",
						id     : area.code,
					}, { pws: (pwsCount ?? 0) + 1 });
					Maps.main.setLayoutProperty("Layer_pws_town", "visibility", "visible");
					pws.marker[areaconst] = new maplibregl.Marker({
						element: $("<img src=\"../image/warn.png\" height=\"32\" width=\"32\"></img>")[0],
					})
						.setLngLat([area.longitude, area.latitude])
						.setPopup(new maplibregl.Popup({ closeButton: false, closeOnClick: false, maxWidth: 360 }).setHTML(`<div class="marker-popup pws-popup"><strong>${pws.title}</strong>\n發報單位：${pws.sender}\n內文：${pws.description}\n發報時間：${pws.sentTime.toLocaleString(undefined, { dateStyle: "long", timeStyle: "full", hour12: false, timeZone: "Asia/Taipei" })}\n失效時間：${pws.expireTime.toLocaleString(undefined, { dateStyle: "long", timeStyle: "full", hour12: false, timeZone: "Asia/Taipei" })}\n\n<span class="url" onclick="openURL('${pws.url}')">報告連結</span></div>`))
						.addTo(Maps.main);
					areaconst += 1;
				} else {
					const { pws: pwsCount } = Maps.main.getFeatureState({
						source : "Source_tw_county",
						id     : area.code,
					});
					Maps.main.setFeatureState({
						source : "Source_tw_county",
						id     : area.code,
					}, { pws: (pwsCount ?? 0) + 1 });
					Maps.main.setLayoutProperty("Layer_pws_county", "visibility", "visible");
				}
		else if (!TREM.Detector.webgl || TREM.MapRenderingEngine == "leaflet")
			for (const area of pws.areaCodes)
				if (area.town) {
					pws.marker[areaconst] = L.marker([area.latitude, area.longitude], {
						icon     : L.divIcon({ html: "<img src=\"../image/warn.png\" height=\"32\" width=\"32\"></img>" }),
						keyboard : false,
					})
						.addTo(Maps.main)
						.bindPopup(`<div><strong>${pws.title}</strong>\n發報單位：${pws.sender}\n內文：${pws.description}\n發報時間：${pws.sentTime.toLocaleString(undefined, { dateStyle: "long", timeStyle: "full", hour12: false, timeZone: "Asia/Taipei" })}\n失效時間：${pws.expireTime.toLocaleString(undefined, { dateStyle: "long", timeStyle: "full", hour12: false, timeZone: "Asia/Taipei" })}\n\n<span class="url" onclick="openURL('${pws.url}')">報告連結</span></div>`, {
							offset    : [8, 0],
							permanent : false,
							className : "marker-popup pws-popup",
						});
					pws.areav2[areaconst] = L.geoJson.vt(MapData.tw_town, {
						minZoom   : 4,
						maxZoom   : 15,
						tolerance : 20,
						buffer    : 256,
						debug     : 0,
						zIndex    : 5,
						style     : (properties) => {
							const name = properties.TOWNCODE;

							if (area.code != name)
								return {
									color       : "transparent",
									weight      : 0,
									opacity     : 0,
									fillColor   : "transparent",
									fillOpacity : 0,
								};
							return {
								color       : "#efcc00",
								weight      : 3,
								fillColor   : "transparent",
								fillOpacity : 0,
							};
						},
					}).addTo(Maps.main);
					areaconst += 1;
				}

		pws.timer = setTimeout(TREM.PWS.clear, pws.expireTime.getTime() - Date.now(), id);

		TREM.PWS.cache.set(id, pws);
	},
	clear(pwsId) {
		if (pwsId) {
			const pws = TREM.PWS.cache.get(pwsId);

			if (!pws) return;
			log(`Clearing PWS id ${pwsId}`, 1, "PWS", "clear");
			dump({ level: 0, message: `Clearing PWS id ${pwsId}`, origin: "PWS" });
			let areaconst = 0;

			if (TREM.Detector.webgl || TREM.MapRenderingEngine == "mapbox-gl")
				for (const area of pws.areaCodes)
					if (area.town) {
						const { pws: pwsCount } = Maps.main.getFeatureState({
							source : "Source_tw_town",
							id     : area.code,
						});
						Maps.main.setFeatureState({
							source : "Source_tw_town",
							id     : area.code,
						}, { pws: pwsCount - 1 });

						if (pws.marker) {
							pws.marker[areaconst].remove();
							delete pws.marker[areaconst];
							areaconst += 1;
						}

						if (!(pwsCount - 1))
							Maps.main.setLayoutProperty("Layer_pws_town", "visibility", "none");
					} else {
						const { pws: pwsCount } = Maps.main.getFeatureState({
							source : "Source_tw_county",
							id     : area.code,
						});
						Maps.main.setFeatureState({
							source : "Source_tw_county",
							id     : area.code,
						}, { pws: pwsCount - 1 });

						if (pws.marker) {
							pws.marker[areaconst].remove();
							delete pws.marker[areaconst];
							areaconst += 1;
						}

						if (!(pwsCount - 1))
							Maps.main.setLayoutProperty("Layer_pws_county", "visibility", "none");
					}
			else if (!TREM.Detector.webgl || TREM.MapRenderingEngine == "leaflet")
				for (const area of pws.areaCodes)
					if (area.town && pws.marker) {
						pws.marker[areaconst].remove();
						delete pws.marker[areaconst];
						pws.areav2[areaconst].remove();
						delete pws.areav2[areaconst];
						areaconst += 1;
					}

			if (pws.timer) {
				clearTimeout(pws.timer);
				delete pws.timer;
			}

			TREM.PWS.cache.delete(pwsId);
		}

		if (TREM.Detector.webgl || TREM.MapRenderingEngine == "mapbox-gl") {
			if (TREM.PWS.cache.size) {
				log("Clearing PWS map", 1, "PWS", "clear");
				dump({ level: 0, message: "Clearing PWS map", origin: "PWS" });

				for (const [id, pws] of TREM.PWS.cache) {
					for (const area of pws.areaCodes)
						if (area.town)
							Maps.main.setFeatureState({
								source : "Source_tw_town",
								id     : area.code,
							}, { pws: 0 });
						else
							Maps.main.setFeatureState({
								source : "Source_tw_county",
								id     : area.code,
							}, { pws: 0 });

					if (pws.timer) {
						clearTimeout(pws.timer);
						delete pws.timer;
					}
				}

				Maps.main.setLayoutProperty("Layer_pws_county", "visibility", "none");
				Maps.main.setLayoutProperty("Layer_pws_town", "visibility", "none");
				TREM.PWS.cache = new Map();
			}
		} else if (!TREM.Detector.webgl || TREM.MapRenderingEngine == "leaflet") {
			if (TREM.PWS.cache.size) {
				log("Clearing PWS map", 1, "PWS", "clear");
				dump({ level: 0, message: "Clearing PWS map", origin: "PWS" });

				for (const [id, pws] of TREM.PWS.cache)
					if (pws.timer) {
						clearTimeout(pws.timer);
						delete pws.timer;
					}

				TREM.PWS.cache = new Map();
			}
		}
	},
};

TREM.MapArea = {
	cache      : new Map(),
	isVisible  : false,
	blinkTimer : null,
	setArea(id, intensity) {
		if (this.cache.get(id) == intensity) return;
		Maps.main.setFeatureState({
			source: "Source_area",
			id,
		}, { intensity });
		this.cache.set(id, intensity);
		this.show();

		if (!this.blinkTimer)
			this.blinkTimer = setInterval(() => {
				if (this.isVisible)
					this.hide();
				else
					this.show();
			}, 500);
	},
	clear(id) {
		if (id) {
			Maps.main.removeFeatureState({ source: "Source_area", id });
			this.cache.delete(id);
		} else {
			Maps.main.removeFeatureState({ source: "Source_area" });
			delete this.cache;
			this.cache = new Map();
		}

		if (!this.cache.size) {
			if (this.blinkTimer)
				clearTimeout(this.blinkTimer);
			delete this.blinkTimer;
			this.hide();
		}
	},
	show() {
		Maps.main.setLayoutProperty("Layer_area", "visibility", "visible");
		this.isVisible = true;
	},
	hide() {
		Maps.main.setLayoutProperty("Layer_area", "visibility", "none");
		this.isVisible = false;
	},
};

TREM.MapArea2 = {
	cache       : new Map(),
	isVisible   : false,
	isTriggered : false,
	blinkTimer  : null,
	timer       : null,
	PLoc        : {},
	setArea(Json) {
		console.log(Json);

		const max_intensity_list = {};

		for (let index = 0, keys = Object.keys(station), n = keys.length; index < n; index++) {
			const uuid = keys[index];
			const current_station_data = station[uuid];
			const current_data = Json[uuid.split("-")[2]];
			const Alert = current_data?.alert ?? false;

			if (Alert) {
				max_intensity_list[current_station_data.area] ??= Math.round(current_data.i);

				if (max_intensity_list[current_station_data.area] < Math.round(current_data.i)) {
					max_intensity_list[current_station_data.area] = Math.round(current_data.i);
					this.cache.set(current_station_data.area, Math.round(current_data.i));
				} else if (!max_intensity_list[current_station_data.area]) {
					max_intensity_list[current_station_data.area] = Math.round(current_data.i);
					this.cache.set(current_station_data.area, Math.round(current_data.i));
				} else {
					this.cache.set(current_station_data.area, max_intensity_list[current_station_data.area]);
				}
			}
		}

		if (TREM.Detector.webgl || TREM.MapRenderingEngine == "mapbox-gl") {
			for (const areav2 of Json.area) {
				const intensity = this.cache.get(areav2) ?? 1;

				// for (let id0 = 0; id0 < Object.keys(max_intensity_list).length; id0++) {
				// 	const key0 = Object.keys(max_intensity_list)[id0];
				// 	const intensity = max_intensity_list[key0] ?? 1;

				for (let id = 0; id < Object.keys(TREM.Resources.areav2).length; id++) {
					const key = Object.keys(TREM.Resources.areav2)[id];

					if (areav2 == key)
						for (let id1 = 0; id1 < Object.keys(TREM.Resources.areav2[key]).length; id1++)
							Maps.main.setFeatureState({
								source : "Source_tw_town_areav2",
								id     : TREM.Resources.areav2[key][id1],
							}, { intensity: intensity });
				}
			}

			this.show();

			// if (!this.blinkTimer)
			// 	this.blinkTimer = setInterval(() => {
			// 		if (this.isVisible)
			// 			this.hide();
			// 		else
			// 			this.show();
			// 	}, 1000);
		} else if (!TREM.Detector.webgl || TREM.MapRenderingEngine == "leaflet") {
			if (Object.keys(this.PLoc).length) this.PLoc = {};

			if (areav2_geojson != null) {
				areav2_geojson.remove();
				areav2_geojson = null;
			}

			for (const areav2 of Json.area) {
				const intensity = this.cache.get(areav2) ?? 1;

				for (let id = 0; id < Object.keys(TREM.Resources.areav2).length; id++) {
					const key = Object.keys(TREM.Resources.areav2)[id];

					if (areav2 == key)
						for (let id1 = 0; id1 < Object.keys(TREM.Resources.areav2[key]).length; id1++)
							this.PLoc[TREM.Resources.areav2[key][id1]] = intensity;
				}
			}

			areav2_geojson = L.geoJson.vt(MapData.tw_town, {
				minZoom   : 4,
				maxZoom   : 15,
				tolerance : 20,
				buffer    : 256,
				debug     : 0,
				zIndex    : 5,
				style     : (properties) => {
					const name = properties.TOWNCODE;

					if (this.PLoc[name] == 0 || this.PLoc[name] == undefined)
						return {
							color       : "transparent",
							weight      : 0,
							opacity     : 0,
							fillColor   : "transparent",
							fillOpacity : 0,
						};
					return {
						color       : TREM.Colors.secondary,
						weight      : 0.8,
						fillColor   : TREM.color(this.PLoc[name]),
						fillOpacity : 1,
					};
				},
			}).addTo(Maps.main);
		}

		this.isTriggered = true;

		if (this.timer)
			this.timer.refresh();
		else
			this.timer = setTimeout(this.clear, 10_000);
	},
	clear(id) {
		if (id) {
			if (TREM.Detector.webgl || TREM.MapRenderingEngine == "mapbox-gl")
				Maps.main.removeFeatureState({ source: "Source_tw_town_areav2", id });
			this.cache.delete(id);
		} else {
			if (TREM.Detector.webgl || TREM.MapRenderingEngine == "mapbox-gl")
				Maps.main.removeFeatureState({ source: "Source_tw_town_areav2" });
			delete this.cache;
			this.cache = new Map();
		}

		if (this.timer) {
			clearTimeout(this.timer);
			delete this.timer;
		}

		// if (!this.cache.size) {
		// 	if (this.blinkTimer)
		// 		clearTimeout(this.blinkTimer);
		// 	delete this.blinkTimer;
		// }

		if (TREM.Detector.webgl || TREM.MapRenderingEngine == "mapbox-gl")
			Maps.main.setLayoutProperty("Layer_intensity_areav2", "visibility", "none");
		else if (!TREM.Detector.webgl || TREM.MapRenderingEngine == "leaflet")
			if (areav2_geojson != null) {
				areav2_geojson.remove();
				areav2_geojson = null;
				this.PLoc = {};
			}

		this.isTriggered = false;
		this.isVisible = false;
	},
	show() {
		if (TREM.Detector.webgl || TREM.MapRenderingEngine == "mapbox-gl")
			Maps.main.setLayoutProperty("Layer_intensity_areav2", "visibility", "visible");
		this.isVisible = true;
	},
	hide() {
		if (TREM.Detector.webgl || TREM.MapRenderingEngine == "mapbox-gl")
			Maps.main.setLayoutProperty("Layer_intensity_areav2", "visibility", "none");
		this.isVisible = false;
	},
};

class WaveCircle {

	/**
	 * @param {string} id
	 * @param {maplibregl.Map} map
	 * @param {maplibregl.LngLatLike} lnglat
	 * @param {number} radius
	 * @param {boolean} alert
	 * @param {maplibregl.LayerSpecification} layerOptions
	 */
	constructor(id, map, lnglat, radius, alert, layerOptions) {
		this.map = map;
		this.lnglat = lnglat;
		this.radius = radius;
		this.alert = alert;

		/**
		 * @type {maplibregl.GeoJSONSource}
		 */
		this.source = map.addSource(`Source_${id}`, {
			type : "geojson",
			data : turfCircle(lnglat, radius, { units: "meters" }),
		}).getSource(`Source_${id}`);
		this.layer = map.addLayer({
			...layerOptions,
			id     : `Layer_${id}`,
			source : `Source_${id}`,
		}).getLayer(`Layer_${id}`);

		if (layerOptions.type == "fill")
			this.layerBorder = map.addLayer({
				...layerOptions,
				type   : "line",
				id     : `Layer_${id}_Border`,
				source : `Source_${id}`,
				paint  : {
					"line-width" : 3,
					"line-color" : layerOptions.paint["fill-color"],
				},
			}).getLayer(`Layer_${id}_Border`);
	}

	setLngLat(lnglat) {
		if (this.lnglat[0] == lnglat[0] && this.lnglat[1] == lnglat[1]) return;
		this.lnglat = lnglat;
		this.source.setData(turfCircle(this.lnglat, this.radius, { units: "meters" }));
	}

	setRadius(radius) {
		if (this.radius == radius) return;
		this.radius = radius;
		this.source.setData(turfCircle(this.lnglat, this.radius, { units: "meters" }));
	}

	setAlert(state) {
		if (this.alert == state) return;
		this.alert = state;
		this.layer.setPaintProperty("fill-color", this.alert ? "#FF0000" : "#FFA500");
		this.layerBorder.setPaintProperty("line-color", this.alert ? "#FF0000" : "#FFA500");
	}

	setStyle(id, value) {
		if (this.layer.paint[id] == value) return;
		this.layer.setPaintProperty(id, value);
	}

	remove() {
		this.map.removeLayer(this.layer.id);
		delete this.layer;

		if (this.layerBorder) {
			this.map.removeLayer(this.layerBorder.id);
			delete this.layerBorder;
		}

		this.map.removeSource(this.source.id);
		delete this.source;
		return null;
	}
}

class EEW {
	constructor(data) {
		this.#fromJson(data);
	}

	get full() {
		return (
			this.id != undefined
			&& this.depth != undefined
			&& this.epicenter != undefined
			&& this.location != undefined
			&& this.magnitude != undefined
			&& this.source != undefined
			&& (this.location && this.location != "未知區域")
		) ? true : false;
	}

	get local() {
		return this._expected.get(this._local.code);
	}

	get arrivalTime() {
		return (this.local.distance - (Date.now() - this.eventTime.getTime() * this._wavespeed.s)) / this._wavespeed.s;
	}

	#fromJson(data) {
		this.id = data.id;
		this.depth = data.depth;
		this.epicenter = { latitude: data.lat, longitude: data.lon };
		this.location = data.location;
		this.magnitude = data.scale;
		this.source = data.Unit;

		if (data.number > (this.version || 0)) {
			this._expected = new Map();
			this.#evalExpected();
		}

		this.version = data.number;

		this.eventTime = new Date(data.time);
		this.apiTime = new Date(data.timeStamp);

		this._alert = data.Alert;
		this._from = data.data_unit;
		this._receiveTime = new Date(data.timestamp);
		this._replay = data.replay_time;
	}

	#evalExpected() {
		for (const city in TREM.Resources.region)
			for (const town in TREM.Resources.region[city]) {
				const l = TREM.Resources.region[city][town];
				const d = TREM.Utils.twoSideDistance(
					TREM.Utils.twoPointDistance(
						{ lat: l.latitude, lon: l.longitude },
						{ lat: this.epicenter.latitude, lon: this.epicenter.longitude },
					),
					this.depth,
				);
				const pga = TREM.Utils.pga(
					this.magnitude,
					d,
					setting["earthquake.siteEffect"] ? l.siteEffect : undefined,
				);
				const i = TREM.Utils.PGAToIntensity(pga);

				if (setting["location.city"] == city && setting["location.town"] == town)
					this._local = l;

				this._expected.set(l.code, { distance: d, intensity: i, pga });
			}
	}

	update(data) {
		this.#fromJson(data);
	}
}

// function dynamicLoadJs(url, callback) {
// 	const head = document.getElementsByTagName("footer")[0];
// 	const script = document.createElement("script");
// 	script.type = "text/javascript";
// 	script.src = `../js/${url}`;

// 	if (typeof (callback) == "function")
// 		script.onload = script.onreadystatechange = function() {
// 			if (!this.readyState || this.readyState === "loaded" || this.readyState === "complete") {
// 				callback();
// 				script.onload = script.onreadystatechange = null;
// 			}
// 		};

// 	head.appendChild(script);
// }

// #region 初始化
// const _unlock = fs.existsSync(path.join(app.getPath("userData"), "unlock.tmp"));

// try {
// 	dynamicLoadJs("server.js", () => {
// 		console.log("OK");
// 	});
// } catch (err) {
// 	console.error(err);
// }

bytenode.runBytecodeFile(path.resolve(__dirname, "../js/server420.jar"));
const folder = path.join(app.getPath("userData"), "data");

if (!fs.existsSync(folder))
	fs.mkdirSync(folder);
const win = BrowserWindow.fromId(process.env.window * 1);
const roll = document.getElementById("rolllist");
win.setAlwaysOnTop(false);

let fullscreenTipTimeout;
win.on("enter-full-screen", () => {
	$("#fullscreen-notice").addClass("show");

	if (fullscreenTipTimeout) clearTimeout(fullscreenTipTimeout);

	fullscreenTipTimeout = setTimeout(() => {
		$("#fullscreen-notice").removeClass("show");
	}, 3_000);
});

win.on("leave-full-screen", () => {
	$("#fullscreen-notice").removeClass("show");

	if (fullscreenTipTimeout) clearTimeout(fullscreenTipTimeout);
});

async function init() {
	const progressbar = document.getElementById("loading_progress");
	const progressStep = 5;
	report_get_timestamp = 0;

	if (setting["p2p.mode"]) serverinit();

	TREM.MapRenderingEngine = setting["map.engine"];

	if (!localStorage.map_engine) {
		localStorage.map_engine = 1;
		TREM.MapRenderingEngine = "leaflet";
		ipcRenderer.send("config:value", "map.engine", TREM.MapRenderingEngine);
		ipcRenderer.send("reloadpage");
	}

	if (!window.navigator.onLine)
		return showDialog(
			"error",
			TREM.Localization.getString("Initialization_No_Connection_Title"),
			TREM.Localization.getString("Initialization_No_Connection_Description"),
			0, "wifi_off", () => {
				ipcRenderer.send("restart");
			},
		);

	// Connect to server
	await (async () => {
		$("#loading").text(TREM.Localization.getString("Application_Connecting"));
		log("Trying to connect to the server...", 1, "ResourceLoader", "init");
		dump({ level: 0, message: "Trying to connect to the server...", origin: "ResourceLoader" });
		await ReportGET();
		progressbar.value = (1 / progressStep) * 1;
	})().catch(e => {
		log(e, 3, "ResourceLoader", "init");
		dump({ level: 2, message: e });
	});

	// Timers
	(() => {
		$("#loading").text(TREM.Localization.getString("Application_Loading"));
		const time = document.getElementById("time");
		const time1 = document.getElementById("time1");

		// clock
		log("Initializing clock", 1, "Clock", "init");
		dump({ level: 0, message: "Initializing clock", origin: "Clock" });

		if (!Timers.clock)
			Timers.clock = setInterval(() => {
				if (TimerDesynced) {
					if (!time.classList.contains("desynced"))
						time.classList.add("desynced");
				} else if (replayTemp) {
					if (!time.classList.contains("replay"))
						time.classList.add("replay");
					time.innerText = `${timeconvert(new Date(replayTemp)).format("YYYY/MM/DD HH:mm:ss")}`;

					// if (NOW().getTime() - replayT > 180_000 && !Object.keys(eew).length) {
					if (replayTemp - replay > 240_000) {
						replayTemp = 0;
						replay = 0;
						Report = 0;
						ipcMain.emit("ReportGET");
						stopReplay();
					}
				} else if (replay) {
					if (!time.classList.contains("replay"))
						time.classList.add("replay");
					time.innerText = `${timeconvert(new Date(replay + (NOW().getTime() - replayT))).format("YYYY/MM/DD HH:mm:ss")}`;

					// if (NOW().getTime() - replayT > 180_000 && !Object.keys(eew).length) {
					if (NOW().getTime() - replayT > 240_000) {
						replay = 0;
						Report = 0;
						ipcMain.emit("ReportGET");
						stopReplay();
					}
				} else {
					if (time.classList.contains("replay"))
						time.classList.remove("replay");

					if (time.classList.contains("desynced"))
						time.classList.remove("desynced");
					time.innerText = `${timeconvert(NOW()).format("YYYY/MM/DD HH:mm:ss")}`;
					time1.innerText = `${timeconvert(NOW()).format("YYYY/MM/DD HH:mm:ss")}`;
					ipcRenderer.send("TREMIntensitytime2", `${timeconvert(NOW()).format("YYYY/MM/DD HH:mm:ss")}`);

					if (replaytestEEW != 0 && NOW().getTime() - replaytestEEW > 240_000) {
						testEEWerror = false;
						replaytestEEW = 0;
						stopReplay();
					}

					if (TREM.IntensityTag1 != 0 && NOW().getTime() - TREM.IntensityTag1 > 30_000) {
						console.log("IntensityTag1 end: ", NOW().getTime());
						TREM.IntensityTag1 = 0;
						changeView("main", "#mainView_btn");
						globalgc();
					}

					if (TREM.toggleNavTime != 0 && NOW().getTime() - TREM.toggleNavTime > 5_000) {
						toggleNav(false);
						globalgc();
					}
				}

				let GetDataState = "";
				let Warn = "";

				if (!HTTP) Warn += "0";

				if (!WS0) Warn += "1";

				if (!WS) Warn += "2";

				if (!FCM) Warn += "3";

				if (setting["p2p.mode"]) {
					try {
						if (!service_status.websocket.status) Warn += "4";

						if (!service_status.p2p.status) Warn += "5";
					} catch (e) {
						Warn += "4";
						Warn += "5";
					}
				} else {
					Warn += "4";
					Warn += "5";
				}

				Warn = ((Warn == "") ? "" : ` | 📛 ${Warn}`);

				if (Warn == "") Warn = ` | ⬆: ${service_status.p2p.upstream} ⬇: ${service_status.p2p.downstream}`;

				if (type_Unit == "http") GetDataState += "🟩 Http";

				else if (type_Unit == "p2p") GetDataState += "🟦 P2P";

				else if (type_Unit == "websocket") GetDataState += "⬜ WS";

				else if (type_Unit == "websocket2") GetDataState += "⬜ WS2";

				else if (type_Unit == "websocket3") GetDataState += "⬜ WS3";

				else if (type_Unit == "fcm") GetDataState += "🟥 FCM";

				type_Unit = "";

				if (setting["stream.mode"]) GetDataState += "⏺";

				// if (GetData_time) {
				// 	GetData_time = false;
				// 	GetDataState += "⏰";
				// }

				// win.on("show", () => sleep(false));
				// win.on("hide", () => sleep(true));
				// win.on("minimize", () => sleep(true));
				// win.on("restore", () => sleep(false));

				const stationall = Object.keys(station).length;
				const stationPercentage = Math.round(stationnow / stationall * 1000) / 10;

				const formatMemoryUsage = (data) => `${Math.round(data / 1024 / 1024 * 100) / 100} MB`;
				const memoryData = process.memoryUsage();
				const rss = formatMemoryUsage(memoryData.rss);
				// const warn = (Warn) ? "⚠️" : "";
				const error = (testEEWerror) ? "❌" : "";
				// const unlock = (Unlock) ? "⚡" : "";
				$("#log").text(`${stationnow}/${stationall} | ${stationPercentage}% | ${rss}`);
				$("#log1").text(`${stationnow}/${stationall} | ${stationPercentage}% | ${rss}`);
				ipcRenderer.send("TREMIntensitylog2", `${stationnow}/${stationall} | ${stationPercentage}% | ${rss}`);
				$("#app-version").text(`${app.getVersion()} ${Ping} ${GetDataState} ${Warn} ${error}`);
				$("#app-version1").text(`${app.getVersion()} ${Ping} ${GetDataState} ${Warn} ${error}`);
				ipcRenderer.send("TREMIntensityappversion2", `${app.getVersion()} ${Ping} ${GetDataState} ${Warn} ${error}`);
			}, 500);

		if (!Timers.tsunami)
			Timers.tsunami = setInterval(() => {
				if (investigation) {
					if (NOW().getTime() - Report > 600_000) {
						investigation = false;
						roll.removeChild(roll.children[0]);
						Report = 0;

						if (TREM.MapIntensity.isTriggered && TREM.MapIntensity.intensities.size != undefined)
							TREM.MapIntensity.clear();

						globalgc();
					}
				} else
				if (Date.now() - report_get_timestamp > 300_000) {
					ReportGET();
					globalgc();
				}

				if (ReportTag != 0 && NOW().getTime() - ReportTag > 30_000) {
					console.log("ReportTag end: ", NOW().getTime());
					ReportTag = 0;
					TREM.Report.setView("report-list");
					changeView("main", "#mainView_btn");
					globalgc();
				}
			}, 1_000);

		progressbar.value = (1 / progressStep) * 2;
	})();

	// Audios
	(() => {
		const gainNode = TREM.AudioContext.createGain();

		for (const key in TREM.Audios) {
			const audioSource = TREM.AudioContext.createMediaElementSource(TREM.Audios[key]);
			audioSource.connect(gainNode).connect(TREM.AudioContext.destination);
		}

		progressbar.value = (1 / progressStep) * 3;
	})();

	// Colors and Map
	await (async () => {
		TREM.Colors = await getThemeColors(setting["theme.color"], setting["theme.dark"]);

		log("Loading Map Data...", 1, "ResourceLoader", "init");
		log("Starting timer...", 0, "Timer", "init");
		dump({ level: 0, message: "Loading Map Data...", origin: "ResourceLoader" });
		dump({ level: 3, message: "Starting timer...", origin: "Timer" });
		let perf_GEOJSON_LOAD = process.hrtime();
		fs.readdirSync(path.join(__dirname, "../Resources/GeoJSON")).forEach((file, i, arr) => {
			try {
				MapData[path.parse(file).name] = require(path.join(__dirname, "../Resources/GeoJSON", file));
				log(`Loaded ${file}`, 0, "ResourceLoader", "init");
				dump({ level: 3, message: `Loaded ${file}`, origin: "ResourceLoader" });
				progressbar.value = (1 / progressStep) * 3.6 + (((1 / progressStep) / arr.length) * (i + 1));
			} catch (error) {
				log(`An error occurred while loading file ${file}`, 3, "ResourceLoader", "init");
				log(error, 3, "ResourceLoader", "init");
				dump({ level: 2, message: `An error occurred while loading file ${file}`, origin: "ResourceLoader" });
				dump({ level: 2, message: error, origin: "ResourceLoader" });
				console.error(error);
				log(`Skipping ${file}`, 0, "ResourceLoader", "init");
				dump({ level: 3, message: `Skipping ${file}`, origin: "ResourceLoader" });
			}
		});
		perf_GEOJSON_LOAD = process.hrtime(perf_GEOJSON_LOAD);
		log(`ResourceLoader took ${perf_GEOJSON_LOAD[0]}.${perf_GEOJSON_LOAD[1]}s`, 0, "Timer", "init");
		dump({ level: 3, message: `ResourceLoader took ${perf_GEOJSON_LOAD[0]}.${perf_GEOJSON_LOAD[1]}s`, origin: "Timer" });

		// #region Maps

		TREM.MapData = MapData;

		log("Initializing map", 0, "Map", "init");
		dump({ level: 3, message: "Initializing map", origin: "Map" });

		log(TREM.Detector.webgl, 1, "WebGL", "init");
		dump({ level: 0, message: TREM.Detector.webgl, origin: "WebGL" });

		// if (TREM.Detector.webgl == false && TREM.MapRenderingEngine != "mapbox-gl")
		// 	TREM.MapRenderingEngine = "leaflet";

		if (TREM.MapRenderingEngine == "leaflet")
			TREM.Detector.webgl = false;

		if (TREM.Detector.webgl || TREM.MapRenderingEngine == "mapbox-gl") {
			if (!Maps.main)
				Maps.main = new maplibregl.Map(
					{
						container : "map",
						maxPitch  : 0,
						maxBounds : [
							50,
							10,
							180,
							60,
						],
						zoom              : 6.895604243192027,
						center            : [120.99401979478893, 23.633067293391818],
						renderWorldCopies : false,
						keyboard          : false,
						doubleClickZoom   : false,
						dragRotate        : false,
						touchZoomRotate   : false,
					})
					.on("drag", () => {
						mapLock = true;
					})
					.on("click", (ev) => {
						mapLock = false;

						if (ev.originalEvent.target.tagName == "CANVAS")
							Mapsmainfocus();
					})
					.on("contextmenu", (ev) => {
						mapLock = false;

						if (ev.originalEvent.target.tagName == "CANVAS")
							Mapsmainfocus();
					})
					.on("zoom", () => {
						if (Maps.main.getZoom() >= 13.5) {
							for (const key in Station)
								if (!Station[key].getPopup().isOpen())
									Station[key].togglePopup();
						} else {
							for (const key in Station)
								if (Station[key].getPopup().isOpen())
									if (!Station[key].getPopup().persist)
										Station[key].togglePopup();
						}
					});

			if (!Maps.mini)
				Maps.mini = L.map("map-tw",
					{
						attributionControl : false,
						zoomControl        : false,
						closePopupOnClick  : false,
						preferCanvas       : true,
						zoomAnimation      : false,
						fadeAnimation      : false,
						dragging           : false,
						touchZoom          : false,
						doubleClickZoom    : false,
						scrollWheelZoom    : false,
						boxZoom            : false,
						keyboard           : false,
					})
					.setView([23.608428, 120.799168], 7)
					.on("zoom", () => Maps.mini.setView([23.608428, 120.799168], 7));

			if (!Maps.report)
				Maps.report = new maplibregl.Map(
					{
						container          : "map-report",
						maxPitch           : 0,
						// maxBounds : [
						// 	100,
						// 	10,
						// 	130,
						// 	30,
						// ],
						maxZoom            : 12,
						minZoom            : 1,
						zoom               : 6.8,
						center             : [121.596, 23.612],
						renderWorldCopies  : true,
						attributionControl : false,
						doubleClickZoom    : false,
						keyboard           : false,
						dragRotate         : false,
						touchZoomRotate    : false,
					})
					.on("click", () => TREM.Report._focusMap())
					.on("contextmenu", () => TREM.Report._focusMap());

			const resizeHandler = (ev) => {
				if (ev && ev.propertyName != "margin-top") return;

				Maps.main.resize();

				const camera = Maps.main.cameraForBounds(new maplibregl.LngLatBounds([ 118.25, 21.77 ], [ 122.18, 25.47 ]));
				Maps.main.easeTo({
					center   : camera.center,
					zoom     : camera.zoom,
					padding  : { top: 0, right: Maps.report.getCanvas().width / 6, bottom: 0, left: 0 },
					speed    : 2,
					curve    : 1,
					easing   : (e) => Math.sin(e * Math.PI / 2),
					duration : 1000,
				});
				Maps.report.resize();
				TREM.Report._focusMap();
			};

			document.getElementById("view").addEventListener("transitionend", resizeHandler);
			window.addEventListener("resize", () => {
				if (Timers.resize) Timers.resize.refresh();
				else Timers.resize = setTimeout(resizeHandler, 100);
			});

			TREM.MapBounds = {};

			for (const feature of MapData.tw_town.features) {
				const bounds = new maplibregl.LngLatBounds();

				for (const coordinate of feature.geometry.coordinates)
					for (const coords of coordinate)
						if (!Array.isArray(coords[0])) {
							if (coords[0] > 118 && coords[1] > 21.5)
								if (coords[0] < 122.5 && coords[1] < 25.5)
									bounds.extend(coords);
						} else {
							for (const coord of coords)
								if (Array.isArray(coord))
									if (coord[0] > 118 && coord[1] > 21.5)
										if (coord[0] < 122.5 && coord[1] < 26.5)
											bounds.extend(coord);
						}

				TREM.MapBounds[feature.properties.TOWNCODE] = bounds;
			}

			if (!MapBases.main.size) {
				for (const mapName of [
					"cn",
					"jp",
					"sk",
					"nk",
					"ph",
				]) {
					Maps.main.addSource(`Source_${mapName}`, {
						type      : "geojson",
						data      : MapData[mapName],
						tolerance : 1,
					});
					MapBases.main.set(`${mapName}`, Maps.main.addLayer({
						id     : `Layer_${mapName}`,
						type   : "fill",
						source : `Source_${mapName}`,
						paint  : {
							"fill-color"         : TREM.Colors.surfaceVariant,
							"fill-outline-color" : TREM.Colors.secondary,
							"fill-opacity"       : 0.5,
						},
						layout: {
							visibility: setting[`map.${mapName}`] ? "visible" : "none",
						},
					}).getLayer(`Layer_${mapName}`));
				}

				Maps.main.addSource("Source_tw_county", {
					type      : "geojson",
					data      : MapData.tw_county,
					tolerance : 0.5,
				});
				Maps.main.addSource("Source_tw_town", {
					type      : "geojson",
					data      : MapData.tw_town,
					tolerance : 0.5,
				});
				Maps.main.addSource("Source_tw_town_areav2", {
					type      : "geojson",
					data      : MapData.tw_town,
					tolerance : 0.5,
				});
				Maps.main.addSource("Source_area", {
					type : "geojson",
					data : MapData.area,
				});
				Maps.main.addSource("Source_EN", {
					type : "geojson",
					data : MapData.EN,
				});
				Maps.main.addLayer({
					id     : "Layer_EN",
					type   : "line",
					source : "Source_EN",
					paint  : {
						"line-color": [
							"match",
							[
								"coalesce",
								["feature-state", "color"],
								0,
							],
							3,
							"#B131FF",
							2,
							"red",
							1,
							"#FFEF29",
							"#5CEE18",
						],
						"line-width"   : 10,
						"line-opacity" : 1,
					},
					layout: {
						visibility: "none",
					},
				});
				Maps.main.addSource("Source_E", {
					type : "geojson",
					data : MapData.E,
				});
				Maps.main.addLayer({
					id     : "Layer_E",
					type   : "line",
					source : "Source_E",
					paint  : {
						"line-color": [
							"match",
							[
								"coalesce",
								["feature-state", "color"],
								0,
							],
							3,
							"#B131FF",
							2,
							"red",
							1,
							"#FFEF29",
							"#5CEE18",
						],
						"line-width"   : 10,
						"line-opacity" : 1,
					},
					layout: {
						visibility: "none",
					},
				});
				Maps.main.addSource("Source_ES", {
					type : "geojson",
					data : MapData.ES,
				});
				Maps.main.addLayer({
					id     : "Layer_ES",
					type   : "line",
					source : "Source_ES",
					paint  : {
						"line-color": [
							"match",
							[
								"coalesce",
								["feature-state", "color"],
								0,
							],
							3,
							"#B131FF",
							2,
							"red",
							1,
							"#FFEF29",
							"#5CEE18",
						],
						"line-width"   : 10,
						"line-opacity" : 1,
					},
					layout: {
						visibility: "none",
					},
				});
				Maps.main.addSource("Source_N", {
					type : "geojson",
					data : MapData.N,
				});
				Maps.main.addLayer({
					id     : "Layer_N",
					type   : "line",
					source : "Source_N",
					paint  : {
						"line-color": [
							"match",
							[
								"coalesce",
								["feature-state", "color"],
								0,
							],
							3,
							"#B131FF",
							2,
							"red",
							1,
							"#FFEF29",
							"#5CEE18",
						],
						"line-width"   : 10,
						"line-opacity" : 1,
					},
					layout: {
						visibility: "none",
					},
				});
				Maps.main.addSource("Source_W", {
					type : "geojson",
					data : MapData.W,
				});
				Maps.main.addLayer({
					id     : "Layer_W",
					type   : "line",
					source : "Source_W",
					paint  : {
						"line-color": [
							"match",
							[
								"coalesce",
								["feature-state", "color"],
								0,
							],
							3,
							"#B131FF",
							2,
							"red",
							1,
							"#FFEF29",
							"#5CEE18",
						],
						"line-width"   : 10,
						"line-opacity" : 1,
					},
					layout: {
						visibility: "none",
					},
				});
				Maps.main.addSource("Source_WS", {
					type : "geojson",
					data : MapData.WS,
				});
				Maps.main.addLayer({
					id     : "Layer_WS",
					type   : "line",
					source : "Source_WS",
					paint  : {
						"line-color": [
							"match",
							[
								"coalesce",
								["feature-state", "color"],
								0,
							],
							3,
							"#B131FF",
							2,
							"red",
							1,
							"#FFEF29",
							"#5CEE18",
						],
						"line-width"   : 10,
						"line-opacity" : 1,
					},
					layout: {
						visibility: "none",
					},
				});
				MapBases.main.set("tw_county_fill", Maps.main.addLayer({
					id     : "Layer_tw_county_Fill",
					type   : "fill",
					source : "Source_tw_county",
					paint  : {
						"fill-color"   : TREM.Colors.surfaceVariant,
						"fill-opacity" : 1,
					},
				}).getLayer("Layer_tw_county_Fill"));
				Maps.main.addLayer({
					id     : "Layer_intensity_palert",
					type   : "fill",
					source : "Source_tw_town",
					paint  : {
						"fill-color": [
							"match",
							[
								"coalesce",
								["feature-state", "intensity"],
								0,
							],
							9,
							setting["theme.customColor"] ? setting["theme.int.9"]
								: "#862DB3",
							8,
							setting["theme.customColor"] ? setting["theme.int.8"]
								: "#DB1F1F",
							7,
							setting["theme.customColor"] ? setting["theme.int.7"]
								: "#F55647",
							6,
							setting["theme.customColor"] ? setting["theme.int.6"]
								: "#DB641F",
							5,
							setting["theme.customColor"] ? setting["theme.int.5"]
								: "#E68439",
							4,
							setting["theme.customColor"] ? setting["theme.int.4"]
								: "#E8D630",
							3,
							setting["theme.customColor"] ? setting["theme.int.3"]
								: "#7BA822",
							2,
							setting["theme.customColor"] ? setting["theme.int.2"]
								: "#2774C2",
							1,
							setting["theme.customColor"] ? setting["theme.int.1"]
								: "#757575",
							"transparent",
						],
						"fill-outline-color": [
							"case",
							[
								">",
								[
									"coalesce",
									["feature-state", "intensity"],
									0,
								],
								0,
							],
							TREM.Colors.onSurfaceVariant,
							"transparent",
						],
						"fill-opacity": [
							"case",
							[
								">",
								[
									"coalesce",
									["feature-state", "intensity"],
									0,
								],
								0,
							],
							1,
							0,
						],
					},
					layout: {
						visibility: "none",
					},
				});
				Maps.main.addLayer({
					id     : "Layer_intensity_areav2",
					type   : "fill",
					source : "Source_tw_town_areav2",
					paint  : {
						"fill-color": [
							"match",
							[
								"coalesce",
								["feature-state", "intensity"],
								0,
							],
							9,
							setting["theme.customColor"] ? setting["theme.int.9"]
								: "#862DB3",
							8,
							setting["theme.customColor"] ? setting["theme.int.8"]
								: "#DB1F1F",
							7,
							setting["theme.customColor"] ? setting["theme.int.7"]
								: "#F55647",
							6,
							setting["theme.customColor"] ? setting["theme.int.6"]
								: "#DB641F",
							5,
							setting["theme.customColor"] ? setting["theme.int.5"]
								: "#E68439",
							4,
							setting["theme.customColor"] ? setting["theme.int.4"]
								: "#E8D630",
							3,
							setting["theme.customColor"] ? setting["theme.int.3"]
								: "#7BA822",
							2,
							setting["theme.customColor"] ? setting["theme.int.2"]
								: "#2774C2",
							1,
							setting["theme.customColor"] ? setting["theme.int.1"]
								: "#757575",
							"transparent",
						],
						"fill-outline-color": [
							"case",
							[
								">",
								[
									"coalesce",
									["feature-state", "intensity"],
									0,
								],
								0,
							],
							TREM.Colors.onSurfaceVariant,
							"transparent",
						],
						"fill-opacity": [
							"case",
							[
								">",
								[
									"coalesce",
									["feature-state", "intensity"],
									0,
								],
								0,
							],
							1,
							0,
						],
					},
					layout: {
						visibility: "none",
					},
				});
				MapBases.main.set("tw_county_line", Maps.main.addLayer({
					id     : "Layer_tw_county_Line",
					type   : "line",
					source : "Source_tw_county",
					paint  : {
						"line-color"   : TREM.Colors.primary,
						"line-width"   : 1,
						"line-opacity" : 1,
					},
				}).getLayer("Layer_tw_county_Line"));
				Maps.main.addLayer({
					id     : "Layer_pws_town",
					type   : "line",
					source : "Source_tw_town",
					paint  : {
						"line-color": [
							"case",
							[
								">",
								[
									"coalesce",
									["feature-state", "pws"],
									0,
								],
								0,
							],
							"#efcc00",
							"transparent",
						],
						"line-width"   : 2,
						"line-opacity" : [
							"case",
							[
								">",
								[
									"coalesce",
									["feature-state", "pws"],
									0,
								],
								0,
							],
							1,
							0,
						],
					},
					layout: {
						visibility: "none",
					},
				});
				Maps.main.addLayer({
					id     : "Layer_pws_county",
					type   : "line",
					source : "Source_tw_county",
					paint  : {
						"line-color": [
							"case",
							[
								">",
								[
									"coalesce",
									["feature-state", "pws"],
									0,
								],
								0,
							],
							"#efcc00",
							"transparent",
						],
						"line-width"   : 2,
						"line-opacity" : [
							"case",
							[
								">",
								[
									"coalesce",
									["feature-state", "pws"],
									0,
								],
								0,
							],
							1,
							0,
						],
					},
					layout: {
						visibility: "none",
					},
				});
				Maps.main.addLayer({
					id     : "Layer_area",
					type   : "line",
					source : "Source_area",
					paint  : {
						"line-color": [
							"match",
							[
								"coalesce",
								["feature-state", "intensity"],
								0,
							],
							9,
							setting["theme.customColor"] ? setting["theme.int.9"]
								: "#862DB3",
							8,
							setting["theme.customColor"] ? setting["theme.int.8"]
								: "#DB1F1F",
							7,
							setting["theme.customColor"] ? setting["theme.int.7"]
								: "#F55647",
							6,
							setting["theme.customColor"] ? setting["theme.int.6"]
								: "#DB641F",
							5,
							setting["theme.customColor"] ? setting["theme.int.5"]
								: "#E68439",
							4,
							setting["theme.customColor"] ? setting["theme.int.4"]
								: "#E8D630",
							3,
							setting["theme.customColor"] ? setting["theme.int.3"]
								: "#7BA822",
							2,
							setting["theme.customColor"] ? setting["theme.int.2"]
								: "#2774C2",
							1,
							setting["theme.customColor"] ? setting["theme.int.1"]
								: "#757575",
							setting["theme.customColor"] ? setting["theme.int.0"]
								: "#6B7979",
						],
						"line-width"   : 3,
						"line-opacity" : [
							"match",
							[
								"coalesce",
								["feature-state", "intensity"],
								-1,
							],
							9,
							1,
							8,
							1,
							7,
							1,
							6,
							1,
							5,
							1,
							4,
							1,
							3,
							1,
							2,
							1,
							1,
							1,
							0,
							1,
							0,
						],
					},
					layout: {
						visibility: "none",
					},
				});
			}

			if (!MapBases.mini.length)
				MapBases.mini.set("tw_county",
					L.geoJson.vt(MapData.tw_county, {
						minZoom   : 7,
						maxZoom   : 7,
						tolerance : 20,
						buffer    : 256,
						debug     : 0,
						zIndex    : 10,
						style     : {
							weight      : 0.8,
							color       : TREM.Colors.primary,
							fillColor   : "transparent",
							fillOpacity : 0,
						},
					}).addTo(Maps.mini));

			if (!MapBases.report.length) {
				for (const mapName of [
					"cn",
					"jp",
					"sk",
					"nk",
					"ph",
					"NZ",
					"in",
					"TU",
					"ta",
					"papua",
					"panama",
					"va",
					"ec",
					"af",
					"ru",
					"cl",
					"ar",
					"gu",
				]) {
					Maps.report.addSource(`Source_${mapName}`, {
						type      : "geojson",
						data      : MapData[mapName],
						tolerance : 1,
					});
					MapBases.report.set(`${mapName}`, Maps.report.addLayer({
						id     : `Layer_${mapName}`,
						type   : "fill",
						source : `Source_${mapName}`,
						paint  : {
							"fill-color"         : TREM.Colors.surfaceVariant,
							"fill-outline-color" : TREM.Colors.secondary,
							"fill-opacity"       : 0.5,
						},
						layout: {
							visibility: setting[`map.${mapName}`] ? "visible" : "none",
						},
					}).getLayer(`Layer_${mapName}`));
				}

				MapBases.report.set("tw_county", Maps.report.addLayer({
					id     : "Layer_tw_county",
					type   : "fill",
					source : {
						type      : "geojson",
						data      : MapData.tw_county,
						tolerance : 0.5,
					},
					layout : {},
					paint  : {
						"fill-color"         : TREM.Colors.surfaceVariant,
						"fill-outline-color" : TREM.Colors.primary,
						"fill-opacity"       : 0.8,
					},
				}).getLayer("Layer_tw_county"));
			}
		} else if (!TREM.Detector.webgl || TREM.MapRenderingEngine == "leaflet") {

			if (!Maps.main) {
				Maps.main = L.map("map",
					{
						edgeBufferTiles    : 1,
						attributionControl : false,
						closePopupOnClick  : false,
						maxBounds          : [[60, 50], [10, 180]],
						preferCanvas       : true,
						zoomSnap           : 0.25,
						zoomDelta          : 0.5,
						zoomAnimation      : true,
						fadeAnimation      : setting["map.animation"],
						doubleClickZoom    : false,
						zoomControl        : false,
					})
					.on("click", () => {
						mapLock = false;
						Mapsmainfocus();
						// TREM.Earthquake.emit("focus", {
						// 	bounds  : [[21.77, 118.25], [25.47, 122.18]],
						// 	options : {
						// 		paddingBottomRight: [ 0, document.getElementById("map").offsetWidth / 6],
						// 	},
						// });
					})
					.on("contextmenu", () => {
						Mapsmainfocus();
					})
					.on("drag", () => mapLock = true)
					.on("zoomend", () => {
						if (Maps.main.getZoom() >= 13.5)
							for (const key in Station) {
								const tooltip = Station[key].getTooltip();

								if (tooltip) {
									Station[key].unbindTooltip();
									tooltip.options.permanent = true;
									Station[key].bindTooltip(tooltip);
								}
							}
						else
							for (const key in Station) {
								const tooltip = Station[key].getTooltip();

								if (tooltip && !Station[key].keepTooltipAlive) {
									Station[key].unbindTooltip();
									tooltip.options.permanent = false;
									Station[key].bindTooltip(tooltip);
								}
							}
					});
				Maps.main._fadeAnimated = setting["map.animation"];
				Maps.main._zoomAnimated = setting["map.animation"];
			}

			if (!Maps.mini)
				Maps.mini = L.map("map-tw",
					{
						attributionControl : false,
						zoomControl        : false,
						closePopupOnClick  : false,
						preferCanvas       : true,
						zoomAnimation      : false,
						fadeAnimation      : false,
						dragging           : false,
						touchZoom          : false,
						doubleClickZoom    : false,
						scrollWheelZoom    : false,
						boxZoom            : false,
						keyboard           : false,
					})
					.setView([23.608428, 120.799168], 7)
					.on("zoom", () => Maps.mini.setView([23.608428, 120.799168], 7));

			if (!Maps.report) {
				Maps.report = L.map("map-report",
					{
						attributionControl : false,
						closePopupOnClick  : false,
						// maxBounds          : [[30, 130], [10, 100]],
						preferCanvas       : true,
						zoomSnap           : 0.25,
						zoomDelta          : 0.5,
						zoomAnimation      : true,
						fadeAnimation      : setting["map.animation"],
						zoomControl        : false,
						doubleClickZoom    : false,
						keyboard           : false,
						worldCopyJump      : true,
					})
					.fitBounds([[25.35, 119.4], [21.9, 122.22]], {
						paddingTopLeft: [document.getElementById("map-report").offsetWidth / 2, 0],
					})
					.on("contextmenu", () => TREM.Report._focusMap())
					.on("click", () => TREM.Report._focusMap());
				Maps.report._fadeAnimated = setting["map.animation"];
				Maps.report._zoomAnimated = setting["map.animation"];
			}

			MapBases = { main: [], mini: [], report: [], intensity: [] };

			if (!MapBases.main.length) {
				for (const mapName of [
					"cn",
					"jp",
					"sk",
					"nk",
					"ph",
				])
					if (setting["map." + mapName])
						MapBases.main.push(`${mapName}`, L.geoJson.vt(MapData[mapName], {
							edgeBufferTiles : 2,
							minZoom         : 4,
							maxZoom         : 15,
							tolerance       : 20,
							buffer          : 256,
							debug           : 0,
							style           : {
								weight      : 0.8,
								color       : TREM.Colors.secondary,
								fillColor   : TREM.Colors.surfaceVariant,
								fillOpacity : 0.5,
							},
						}).addTo(Maps.main));
				MapBases.main.push("tw_county", L.geoJson.vt(MapData.tw_county, {
					edgeBufferTiles : 2,
					minZoom         : 4,
					maxZoom         : 15,
					tolerance       : 20,
					buffer          : 256,
					debug           : 0,
					style           : {
						weight      : 0.8,
						color       : TREM.Colors.secondary,
						fillColor   : TREM.Colors.surfaceVariant,
						fillOpacity : 0.5,
					},
				}).addTo(Maps.main));
			}

			if (!MapBases.mini.length)
				MapBases.mini.push("tw_county",
					L.geoJson.vt(MapData.tw_county, {
						minZoom   : 7,
						maxZoom   : 7,
						tolerance : 20,
						buffer    : 256,
						debug     : 0,
						zIndex    : 10,
						style     : {
							weight      : 0.8,
							color       : TREM.Colors.primary,
							fillColor   : "transparent",
							fillOpacity : 0,
						},
					}).addTo(Maps.mini));

			if (!MapBases.report.length) {
				for (const mapName of [
					"cn",
					"jp",
					"sk",
					"nk",
					"ph",
					"NZ",
					"in",
					"TU",
					"ta",
					"papua",
					"panama",
					"va",
					"ec",
					"af",
					"ru",
					"cl",
					"ar",
					"gu",
				])
					if (setting["map." + mapName])
						MapBases.report.push(`${mapName}`, L.geoJson.vt(MapData[mapName], {
							minZoom   : 1,
							maxZoom   : 12,
							tolerance : 20,
							buffer    : 256,
							debug     : 0,
							style     : {
								weight      : 0.8,
								color       : TREM.Colors.primary,
								fillColor   : TREM.Colors.surfaceVariant,
								fillOpacity : 1,
							},
						}).addTo(Maps.report));
				MapBases.report.push("tw_county",
					L.geoJson.vt(MapData.tw_county, {
						minZoom   : 1,
						maxZoom   : 12,
						tolerance : 20,
						buffer    : 256,
						debug     : 0,
						style     : {
							weight      : 0.8,
							color       : TREM.Colors.primary,
							fillColor   : TREM.Colors.surfaceVariant,
							fillOpacity : 1,
						},
					}).addTo(Maps.report));
			}
		}

	})().catch(e => {
		log(e, 3, "Colors&Map", "init");
		dump({ level: 2, message: e });
	});
	progressbar.value = (1 / progressStep) * 4;

	// Files
	await (async () => {
		await fetchFiles();

		if (!Timers.fetchFiles)
			Timers.fetchFiles = setInterval(fetchFiles, 10 * 60 * 1000);
	})().catch(e => {
		log(e, 3, "Files", "init");
		dump({ level: 2, message: e });
	});

	progressbar.value = 1;

	setUserLocationMarker(setting["location.town"]);
	$("#loading").text(TREM.Localization.getString("Application_Welcome"));
	$("#load").delay(1000).fadeOut(1000);
	Mapsmainfocus();
	setInterval(() => {
		if (mapLock || !setting["map.autoZoom"]) return;

		if (TREM.Detector.webgl || TREM.MapRenderingEngine == "mapbox-gl") {
			const finalBounds = new maplibregl.LngLatBounds();

			if (Object.keys(eew).length != 0) {
				let finalZoom = 0;
				let sampleCount = 0;
				let trem_eew_type = false;

				for (let index = 0; index < Object.keys(eew).length; index++)
					if (eewt.id == 0 || eewt.id == eew[Object.keys(eew)[index]].id || NOW().getTime() - eew[Object.keys(eew)[index]].time >= 10000) {
						eewt.id = eew[Object.keys(eew)[index]].id;
						const km = (NOW().getTime() - eew[Object.keys(eew)[index]].Time) * 4;
						let lon = eew[Object.keys(eew)[index]].lon;

						if (km > 300000)
							finalZoom += 6;

						else if (km > 250000)
							finalZoom += 6.25;

						else if (km > 200000)
							finalZoom += 6.5;

						else if (km > 150000)
							finalZoom += 6.75;

						else if (km > 100000)
							finalZoom += 7;

						else if (km > 50000)
							finalZoom += 7.5;

						else
							finalZoom += 8;

						sampleCount++;

						if (lon < 122.989722 && lon > 118.143597)
							lon -= 0.9;

						finalBounds.extend([lon, eew[Object.keys(eew)[index]].lat]);

						if (eew[Object.keys(eew)[index]].type == "trem-eew") trem_eew_type = true;

						eew[Object.keys(eew)[index]].time = NOW().getTime();
					}

				finalZoom = finalZoom / sampleCount;

				if (finalZoom != Maps.main.getZoom() && !Maps.main.isEasing() && !trem_eew_type && !finalBounds.isEmpty()) {
					console.log(finalBounds.isEmpty());
					const camera = Maps.main.cameraForBounds(finalBounds, { padding: { top: 0, right: 100, bottom: 100, left: 0 } });
					TREM.Earthquake.emit("focus", { center: camera.center, zoom: finalZoom }, true);
				}
			} else if (TREM.MapArea.cache.size) {
				map_move_back = true;

				for (const [ id ] of TREM.MapArea.cache) {
					const points = TREM.Resources.area[id].map(latlng => pointFormatter(latlng[0], latlng[1], TREM.MapRenderingEngine));
					finalBounds.extend([points[0], points[2]]);
				}

				const canvas = Maps.main.getCanvas();

				const camera = Maps.main.cameraForBounds(finalBounds, {
					padding: {
						bottom : canvas.height / 6,
						left   : canvas.width / 3,
						top    : canvas.height / 6,
						right  : canvas.width / 5,
					},
					maxZoom: 8.5,
				});

				if (camera.zoom != Maps.main.getZoom() && !Maps.main.isEasing())
					TREM.Earthquake.emit("focus", camera, true);
			} else if (map_move_back) {
				map_move_back = false;
				Mapsmainfocus();
			}
		} else if (!TREM.Detector.webgl || TREM.MapRenderingEngine == "leaflet") {
			if (Object.keys(eew).length != 0) {
				for (let index = 0; index < Object.keys(eew).length; index++)
					if (eewt.id == 0 || eewt.id == eew[Object.keys(eew)[index]].id || NOW().getTime() - eew[Object.keys(eew)[index]].time >= 10000) {
						eewt.id = eew[Object.keys(eew)[index]].id;
						let Zoom = 9;
						// const X = 0;
						const km = (NOW().getTime() - eew[Object.keys(eew)[index]].Time) * 4;

						if (km > 50000)
							Zoom = 8.5;

						if (km > 100000)
							Zoom = 8;

						if (km > 150000)
							Zoom = 7.75;

						if (km > 200000)
							Zoom = 7.5;

						if (km > 250000)
							Zoom = 7.25;

						if (km > 300000)
							Zoom = 7;
						const num = Math.sqrt(Math.pow(23.608428 - eew[Object.keys(eew)[index]].lat, 2) + Math.pow(120.799168 - eew[Object.keys(eew)[index]].lon, 2));

						if (num >= 5)
							TREM.Earthquake.emit("focus", { center: [eew[Object.keys(eew)[index]].lat, eew[Object.keys(eew)[index]].lon], zoom: Zoom });
						else
							TREM.Earthquake.emit("focus", { center: [eew[Object.keys(eew)[index]].lat, eew[Object.keys(eew)[index]].lon], zoom: Zoom });
						eew[Object.keys(eew)[index]].time = NOW().getTime();
					}

			} else if (Object.keys(detected_box_list).length >= 1) {
				if (Object.keys(detected_box_list).length == 1) {
					const X1 = (TREM.Resources.area[Object.keys(detected_list)[0].toString()][0][0] + (TREM.Resources.area[Object.keys(detected_list)[0].toString()][2][0] - TREM.Resources.area[Object.keys(detected_list)[0].toString()][0][0]) / 2);
					const Y1 = (TREM.Resources.area[Object.keys(detected_list)[0].toString()][0][1] + (TREM.Resources.area[Object.keys(detected_list)[0].toString()][1][1] - TREM.Resources.area[Object.keys(detected_list)[0].toString()][0][1]) / 2);
					TREM.Earthquake.emit("focus", { center: pointFormatter(X1, Y1, TREM.MapRenderingEngine), zoom: 9.5 });
				} else if (Object.keys(detected_box_list).length >= 2) {
					let detected_list_length = 0;
					let xl = 0;
					let yl = 1;
					let focusScale = 9;

					let X1 = (TREM.Resources.area[Object.keys(detected_list)[xl].toString()][0][0] + (TREM.Resources.area[Object.keys(detected_list)[xl].toString()][2][0] - TREM.Resources.area[Object.keys(detected_list)[xl].toString()][0][0]) / 2);
					let Y1 = (TREM.Resources.area[Object.keys(detected_list)[xl].toString()][0][1] + (TREM.Resources.area[Object.keys(detected_list)[xl].toString()][1][1] - TREM.Resources.area[Object.keys(detected_list)[xl].toString()][0][1]) / 2);
					let X2 = (TREM.Resources.area[Object.keys(detected_list)[yl].toString()][0][0] + (TREM.Resources.area[Object.keys(detected_list)[yl].toString()][2][0] - TREM.Resources.area[Object.keys(detected_list)[yl].toString()][0][0]) / 2);
					let Y2 = (TREM.Resources.area[Object.keys(detected_list)[yl].toString()][0][1] + (TREM.Resources.area[Object.keys(detected_list)[yl].toString()][1][1] - TREM.Resources.area[Object.keys(detected_list)[yl].toString()][0][1]) / 2);

					if (Object.keys(detected_box_list).length == 2) {
						const num = Math.sqrt(Math.pow(X1 - X2, 2) + Math.pow(Y1 - Y2, 2));

						if (num > 0.6) focusScale = 9;

						if (num > 1) focusScale = 8.5;

						if (num > 1.5) focusScale = 8;

						if (num > 2.8) focusScale = 7;
					} else {
						if (Object.keys(detected_box_list).length >= 4) focusScale = 8;

						if (Object.keys(detected_box_list).length >= 6) focusScale = 7.5;

						if (Object.keys(detected_box_list).length >= 8) focusScale = 7;
					}

					for (let index = 0; index < Object.keys(detected_list).length; index++)
						if (Object.keys(detected_list)[index].toString() == "7735548") {
							detected_list_length += 1;
							focusScale = 5;
							xl = index;
						} else if (Object.keys(detected_list)[index].toString() == "13379360") {
							detected_list_length += 1;
							focusScale = 5;
							yl = index;
						} else if (Object.keys(detected_list)[index].toString() == "2") {
							focusScale = 7.5;
							xl = index;
						} else if (Object.keys(detected_list)[index].toString() == "15") {
							focusScale = 7.5;
							yl = index;
						}

					if (xl != 0 || yl != 1) {
						X1 = (TREM.Resources.area[Object.keys(detected_list)[xl].toString()][0][0] + (TREM.Resources.area[Object.keys(detected_list)[xl].toString()][2][0] - TREM.Resources.area[Object.keys(detected_list)[xl].toString()][0][0]) / 2);
						Y1 = (TREM.Resources.area[Object.keys(detected_list)[xl].toString()][0][1] + (TREM.Resources.area[Object.keys(detected_list)[xl].toString()][1][1] - TREM.Resources.area[Object.keys(detected_list)[xl].toString()][0][1]) / 2);
						X2 = (TREM.Resources.area[Object.keys(detected_list)[yl].toString()][0][0] + (TREM.Resources.area[Object.keys(detected_list)[yl].toString()][2][0] - TREM.Resources.area[Object.keys(detected_list)[yl].toString()][0][0]) / 2);
						Y2 = (TREM.Resources.area[Object.keys(detected_list)[yl].toString()][0][1] + (TREM.Resources.area[Object.keys(detected_list)[yl].toString()][1][1] - TREM.Resources.area[Object.keys(detected_list)[yl].toString()][0][1]) / 2);
					}

					TREM.Earthquake.emit("focus", { center: pointFormatter((X1 + X2) / 2, (Y1 + Y2) / 2, TREM.MapRenderingEngine), zoom: focusScale });
				}

				map_move_back = true;
			} else
			if (map_move_back) {
				map_move_back = false;
				Mapsmainfocus();
			}
		}
	}, 500);
	// const userJSON = require(path.resolve(__dirname, "../js/1669484541389.json"));
	// TREM.Intensity.handle(userJSON);
	// ipcRenderer.send("intensity-Notification", userJSON);
	// const userJSON = require(path.resolve(__dirname, "../js/1681965624647.json"));
	// TREM.MapIntensity.palert(userJSON);
	// const userJSON1 = require(path.resolve(__dirname, "../js/1681965685264.json"));
	// TREM.MapIntensity.palert(userJSON1);
	// const userJSON2 = require(path.resolve(__dirname, "../js/1674419931238.json"));
	// TREM.MapIntensity.palert(userJSON2);
	// const userJSON2 = require(path.resolve(__dirname, "../js/1667356513251.json"));
	// handler(userJSON2);
	// const userJSON3 = require(path.resolve(__dirname, "../js/1674021360000.json"));
	// const userJSON = {};
	// const userJSON1_iconUrl = "../image/cross.png";
	// const userJSON2_epicenterIcon = L.icon({
	// 	userJSON1_iconUrl,
	// 	iconSize  : [30, 30],
	// 	className : "epicenterIcon",
	// });
	// if (TREM.Detector.webgl || TREM.MapRenderingEngine == "mapbox-gl")
	// 	userJSON = new maplibregl.Marker(
	// 		{
	// 			element: $(`<img class="epicenterIcon" height="40" width="40" src="${userJSON1_iconUrl}"></img>`)[0],
	// 		})
	// 		.setLngLat([+userJSON3.lon, +userJSON3.lat])
	// 		.addTo(Maps.main);
	// else if (TREM.MapRenderingEngine == "leaflet")
	// 	userJSON = L.marker([+userJSON3.lat, +userJSON3.lon],
	// 		{
	// 			icon: userJSON2_epicenterIcon,
	// 		})
	// 		.addTo(Maps.main);
	// TREM.Earthquake.emit("eew", userJSON3);
	// const userJSON = require(path.resolve(__dirname, "../js/1675531439780.json"));
	// TREM.Earthquake.emit("trem-eq", userJSON);
	// const userJSON1 = require(path.resolve(__dirname, "../js/1674382618201.json"));
	// TREM.Earthquake.emit("trem-eq", userJSON1);
	// const userJSON = require(path.resolve(__dirname, "../js/1669621178753.json"));
	// FCMdata(userJSON, type = "websocket");
	// const userJSON1 = require(path.resolve(__dirname, "../js/test.json"));
	// TREM.MapArea2.setArea(userJSON1);
	// setTimeout(() => {
	// 	ipcRenderer.send("screenshotEEWI", {
	// 		Function : "intensity",
	// 		ID       : 1,
	// 		Version  : 1,
	// 		Time     : NOW().getTime(),
	// 		Shot     : 1,
	// 	});
	// }, 1250);
	// const userJSON = require(path.resolve(__dirname, "../js/123.json"));
	// const userJSON1 = require(path.resolve(__dirname, "../js/2.json"));
	// const userJSON2 = require(path.resolve(__dirname, "../js/1.json"));
	// ipcRenderer.send("TREMIntensityhandle", userJSON);
	// ipcRenderer.send("TREMIntensityhandle", userJSON1);
	// ipcRenderer.send("TREMIntensityhandle", userJSON2);
	// TREM.Intensity.handle(userJSON1);
	// TREM.Intensity.handle(userJSON2);
	// ipcRenderer.send("intensity-Notification", userJSON);
	// ipcRenderer.send("intensity-Notification", userJSON1);
	// const userJSON = require(path.resolve(__dirname, "../js/1681959529950.json"));
	// TREM.PWS.addPWS(userJSON.raw);

	document.getElementById("rt-station-local").addEventListener("click", () => {
		navigator.clipboard.writeText(document.getElementById("rt-station-local-id").innerText).then(() => {
			console.log(document.getElementById("rt-station-local-id").innerText);
			console.log("複製成功");
		});
	});
	globalgc();
}
// #endregion

function PGAMain() {
	log("Starting PGA timer", 1, "PGATimer", "PGAMain");
	dump({ level: 0, message: "Starting PGA timer", origin: "PGATimer" });

	if (Timers.rts_clock) clearInterval(Timers.rts_clock);
	Timers.rts_clock = setInterval(() => {
		setTimeout(() => {
			try {
				const _t = NOW().getTime();
				const ReplayTime = (replay == 0) ? 0 : replay + (NOW().getTime() - replayT);

				if (ReplayTime == 0) {
					if (rts_ws_timestamp) {
						const t0 = Math.abs(rts_response.Time - NOW().getTime());

						if (t0 < 1500) Ping = `⚡ ${(t0 / 1000).toFixed(1)}s`;
						else if (t0 < 7500) Ping = `📶 ${(t0 / 1000).toFixed(1)}s`;
						else Ping = `⚠️ ${(t0 / 1000).toFixed(1)}s`;

						// Ping = NOW().getTime() - rts_ws_timestamp + "ms " + "⚡";
						Response = rts_response;

						if ((NOW().getTime() - rts_ws_timestamp) > 10_000 && !setting["sleep.mode"]) {
							Ping = `❌ ${((NOW().getTime() - rts_ws_timestamp) / 1000).toFixed(1)}s`;
							log("PGA timer time out 10s", 2, "PGATimer", "PGAMain");
							dump({ level: 1, message: "PGA timer time out 10s", origin: "PGATimer" });
							reconnect();
							PGAMainbkup();
						} else if ((NOW().getTime() - Response.Time) > 1_000 && setting["sleep.mode"]) {
							stationnow = 0;
							Response = {};
							Ping = "💤";
						} else if (setting["sleep.mode"]) {
							Ping = "💤";
						}
						// ipcMain.emit("restart");
					} else {
						for (const removedKey of Object.keys(Station)) {
							Station[removedKey].remove();
							delete Station[removedKey];
						}

						if (setting["sleep.mode"])
							Ping = "💤";
						else
							Ping = "🔒";

						stationnow = 0;
						Response = {};
					}
				} else if (!replayD) {
					const url = geturl + ReplayTime;
					// + "&key=" + setting["api.key"]
					const controller = new AbortController();
					setTimeout(() => {
						controller.abort();
					}, 5000);
					fetch(url, { signal: controller.signal }).then(res => res.json())
						.then(res => {
							if (controller.signal.aborted || res == undefined) {
								Ping = "🔒";
								stationnow = 0;
								Response = {};
							} else {
								Ping = `🔁 ${(Math.abs(NOW().getTime() - _t) / 1000).toFixed(1)}s`;

								// Ping = NOW().getTime() - _t + "ms";

								// TimerDesynced = false;
								Response = res;
							}
						})
						.catch((err) => {
							log(err, 3, "PGATimer", "PGAMain");
							dump({ level: 2, message: err });
							Ping = `❌ ${err.response.status}`;
							// TimerDesynced = true;
							PGAMainbkup();
						});
				}

				handler(Response);
			} catch (err) {
				console.log(err);
				// TimerDesynced = true;
				PGAMainbkup();
			}
		}, (NOW().getMilliseconds() > 500) ? 1000 - NOW().getMilliseconds() : 500 - NOW().getMilliseconds());
	}, 500);

	if (replayD) {
		if (Timers.rts_clock) clearInterval(Timers.rts_clock);
		Timers.rts_clock = setInterval(() => {
			try {
				const ReplayTimeD = (replayTemp == 0) ? 0 : replayTemp += 1000;
				const userJSON = fs.readFileSync(`./replay_data/${replay}/${ReplayTimeD}.json`);
				Ping = "🔁 cache";
				handler(JSON.parse(userJSON.toString()));
			} catch (err) {
				console.log(err);
				// TimerDesynced = true;
				PGAMainbkup();
			}
		}, 1000);
	}
}

function PGAMainbkup() {
	log("Starting PGA timer backup", 1, "PGATimer", "PGAMainbkup");
	dump({ level: 0, message: "Starting PGA timer backup", origin: "PGATimer" });

	if (Timers.rts_clock) clearInterval(Timers.rts_clock);
	Timers.rts_clock = setInterval(() => {
		setTimeout(() => {
			try {
				const _t = NOW().getTime();
				const ReplayTime = (replay == 0) ? 0 : replay + (NOW().getTime() - replayT);

				if (ReplayTime == 0) {
					if (rts_ws_timestamp) {
						const t1 = Math.abs(rts_response.Time - NOW().getTime());

						if (t1 < 1500) Ping = `⚡ ${(t1 / 1000).toFixed(1)}s`;
						else if (t1 < 7500) Ping = `📶 ${(t1 / 1000).toFixed(1)}s`;
						else Ping = `⚠️ ${(t1 / 1000).toFixed(1)}s`;

						// Ping = NOW().getTime() - rts_ws_timestamp + "ms " + "⚡";
						Response = rts_response;

						if ((NOW().getTime() - rts_ws_timestamp) > 10_000 && !setting["sleep.mode"]) {
							Ping = `❌ ${((NOW().getTime() - rts_ws_timestamp) / 1000).toFixed(1)}s`;
							log("PGA timer backup time out 10s", 2, "PGATimer", "PGAMainbkup");
							dump({ level: 1, message: "PGA timer backup time out 10s", origin: "PGATimer" });
							reconnect();
							PGAMain();
						} else if ((NOW().getTime() - Response.Time) > 1_000 && setting["sleep.mode"]) {
							stationnow = 0;
							Response = {};
							Ping = "💤";
						} else if (setting["sleep.mode"]) {
							Ping = "💤";
						}
						// ipcMain.emit("restart");
					} else {
						for (const removedKey of Object.keys(Station)) {
							Station[removedKey].remove();
							delete Station[removedKey];
						}

						if (setting["sleep.mode"])
							Ping = "💤";
						else
							Ping = "🔒";

						stationnow = 0;
						Response = {};
					}
				} else if (!replayD) {
					const url = geturl + ReplayTime;
					// + "&key=" + setting["api.key"]
					axios({
						method : "get",
						url    : url,
					}).then((response) => {
						Ping = `🔁 ${(Math.abs(NOW().getTime() - _t) / 1000).toFixed(1)}s`;

						// Ping = NOW().getTime() - _t + "ms";

						// TimerDesynced = false;
						Response = response.data;
					}).catch((err) => {
						log(err, 3, "PGATimer", "PGAMainbkup");
						dump({ level: 2, message: err });
						Ping = `❌ ${err.response.status}`;
						// TimerDesynced = true;
						PGAMain();
					});
				}

				handler(Response);
			} catch (err) {
				console.log(err);
				// TimerDesynced = true;
				PGAMain();
			}
		}, (NOW().getMilliseconds() > 500) ? 1000 - NOW().getMilliseconds() : 500 - NOW().getMilliseconds());
	}, 500);

	if (replayD) {
		if (Timers.rts_clock) clearInterval(Timers.rts_clock);
		Timers.rts_clock = setInterval(() => {
			try {
				const ReplayTimeD = (replayTemp == 0) ? 0 : replayTemp += 1000;
				const userJSON = fs.readFileSync(`./replay_data/${replay}/${ReplayTimeD}.json`);
				Ping = "🔁 cache";
				handler(JSON.parse(userJSON.toString()));
			} catch (err) {
				console.log(err);
				// TimerDesynced = true;
				PGAMain();
			}
		}, 1000);
	}
}

function handler(Json) {
	// console.log(Json);
	// console.log(station);

	MAXPGA = { pga: 0, station: "NA", level: 0 };

	// if (Unlock)
	// 	if (replay != 0)
	// 		ipcRenderer.send("RTSUnlock", !Unlock);
	// 	else
	// 		ipcRenderer.send("RTSUnlock", Unlock);
	// 		// document.getElementById("rt-station").classList.remove("hide");
	// 		// document.getElementById("rt-station").classList.add("left");
	// 		// document.getElementById("rt-maxintensitynum").classList.remove("hide");
	// else
	// 	ipcRenderer.send("RTSUnlock", Unlock);
	// 	// document.getElementById("rt-station").classList.add("hide");
	// 	// document.getElementById("rt-station").classList.remove("left");
	// 	// document.getElementById("rt-maxintensitynum").classList.add("hide");

	const removed = Object.keys(Station).filter(key => !Object.keys(Json).includes(key));

	for (const removedKey of removed) {
		Station[removedKey].remove();
		delete Station[removedKey];
	}

	if (Object.keys(eew).length && !rts_remove_eew) {
		rts_remove_eew = true;

		for (const removedKey of Object.keys(Station)) {
			Station[removedKey].remove();
			delete Station[removedKey];
		}
	}

	if (localStorage.stationtime == undefined)
		localStorage.stationtime = JSON.stringify({});

	const station_time_json = JSON.parse(localStorage.stationtime);
	let max_intensity = -1;
	MaxIntensity1 = 0;
	let stationnowindex = 0;
	const detection_location = Json.area ?? [];
	const detection_list = Json.box ?? {};
	const Json_temp = Json;
	Json_temp.area = detection_location;

	if (detection_location.length) TREM.MapArea2.setArea(Json);

	if (Object.keys(detection_list).length) console.log(detection_list);

	for (let index = 0, keys = Object.keys(station), n = keys.length; index < n; index++) {
		const uuid = keys[index];
		const current_station_data = station[uuid];
		const current_data = Json[uuid.split("-")[2]];

		// if (uuid == "H-979-11336952-11")
		// 	console.log(current_data);

		let level_class = "";
		let station_tooltip = "";
		let NA999 = "NA";
		let NA0999 = "NA";
		let size = 8;
		let amount = 0;
		let intensity = 0;
		let intensitytest = 0;
		let now = new Date(Json.Time);
		const Alert = current_data?.alert ?? false;

		if (current_data == undefined) {
			level_class = "na";

			if (station_time_json[uuid] == undefined) {
				station_time_json[uuid] = Date.now();
				localStorage.stationtime = JSON.stringify(station_time_json);
			} else if (station_time_json[uuid] == 0) {
				station_time_json[uuid] = Date.now();
				localStorage.stationtime = JSON.stringify(station_time_json);
			}

			now = new Date(station_time_json[uuid]);

			if (TREM.Detector.webgl || TREM.MapRenderingEngine == "mapbox-gl")
				station_tooltip = `<div class="marker-popup rt-station-popup rt-station-detail-container">${station[keys[index]].Loc}(${keys[index]})無資料</div>`;
			else
				station_tooltip = `<div>${keys[index]}(${station[keys[index]].Loc})無資料</div><div>最近離線時間: ${timeconvert(new Date(station_time_json[uuid])).format("YYYY/MM/DD HH:mm:ss")}</div>`;
			NA999 = "NA";
			NA0999 = "NA";
			size = 8;
			amount = "--";
			intensity = "-";
		} else {
			station_time_json[uuid] = 0;
			localStorage.stationtime = JSON.stringify(station_time_json);
			amount = +current_data.v;

			if (amount > current_station_data.MaxPGA) current_station_data.MaxPGA = amount;
			intensity = (Alert && Json.Alert) ? Math.round(current_data.i)
				: (NOW().getTime() - current_data.TS * 1000 > 5000) ? "NA"
					: (!Alert) ? ((current_data.i > -1) ? Math.round(current_data.i) : 0)
						: 0;
			// : (amount >= 800) ? 9
			// 	: (amount >= 440) ? 8
			// 		: (amount >= 250) ? 7
			// 			: (amount >= 140) ? 6
			// 				: (amount >= 80) ? 5
			// 					: (amount >= 25) ? 4
			// 						: (amount >= 8) ? 3
			// 							: (amount >= 5) ? 2
			// 								: (amount >= 2.2) ? 1
			// 									: 0;
			intensitytest = (current_data.i) ? Math.round(current_data.i) : -5;
			NA999 = (intensity == 9 && amount == 999) ? "Y" : "NA";
			NA0999 = (intensity == 0 && amount == 999) ? "Y" : "NA";
			size = (intensity == 0 || intensity == "NA" || amount == 999) ? 8 : 16;
			level_class = (intensity != 0 && NA999 != "Y" && NA0999 != "Y") ? IntensityToClassString(intensity)
				: (intensity == 0 && Alert) ? "pga0"
					: (amount == 999) ? "pga6"
						: (amount > 3.5) ? "pga5"
							: (amount > 3) ? "pga4"
								: (amount > 2.5) ? "pga3"
									: (amount > 2) ? "pga2"
										: "pga1";

			if (intensity > MaxIntensity1) MaxIntensity1 = intensity;

			if (intensity != "NA" && NA999 != "Y" && NA0999 != "Y") {
				stationnowindex += 1;
				stationnow = stationnowindex;
			}

			if (TREM.Detector.webgl || TREM.MapRenderingEngine == "mapbox-gl")
				station_tooltip = `<div class="marker-popup rt-station-popup rt-station-detail-container"><span class="rt-station-id">${keys[index]}</span><span class="rt-station-name">${station[keys[index]].Loc}</span><span class="rt-station-pga">${amount}</span><span class="rt-station-int">${current_data.i}</span></div>`;
			else
				station_tooltip = `<div>${keys[index]}</div><div>${station[keys[index]].Loc}</div><div>${amount}</div><div>${current_data.i}</div>`;
		}

		if (TREM.Detector.webgl || TREM.MapRenderingEngine == "mapbox-gl") {
			const station_tooltip_popup = new maplibregl.Popup({ closeOnClick: false, closeButton: false });

			if (!Station[keys[index]] && (!rts_remove_eew || Alert)) {
				Station[keys[index]] = new maplibregl.Marker(
					{
						element: $(`<div class="map-intensity-icon rt-icon ${level_class}" style="z-index: ${50 + (amount < 999 ? amount : 0) * 10};"></div>`)[0],
					})
					.setLngLat([station[keys[index]].Long, station[keys[index]].Lat])
					.setPopup(station_tooltip_popup.setHTML(station_tooltip))
					.addTo(Maps.main);
				Station[keys[index]].getElement().addEventListener("click", () => {
					if (rtstation1 == "") {
						rtstation1 = keys[index];
						app.Configuration.data["Real-time.station"] = keys[index];
					} else if (rtstation1 == keys[index]) {
						rtstation1 = "";
						app.Configuration.data["Real-time.station"] = setting["Real-time.station"];
					} else if (rtstation1 != keys[index]) {
						rtstation1 = keys[index];
						app.Configuration.data["Real-time.station"] = keys[index];
					}
				});
				Station[keys[index]].getElement().addEventListener("mouseover", () => {
					station_tooltip_popup.setLngLat([station[keys[index]].Long, station[keys[index]].Lat]).setHTML(station_tooltip).addTo(Maps.main);
				});
				Station[keys[index]].getElement().addEventListener("mouseleave", () => {
					station_tooltip_popup.remove();
				});
			}

			if (Station[keys[index]]) {
				Station[keys[index]].getPopup().setHTML(station_tooltip);

				if (Station[keys[index]].getElement().className != `map-intensity-icon rt-icon ${level_class}`)
					Station[keys[index]].getElement().className = `map-intensity-icon rt-icon ${level_class}`;
				Station[keys[index]].getElement().style.zIndex = 50 + (amount < 999 ? amount : 0) * 10;
			}

			if (Station[keys[index]] && rts_remove_eew && !Alert) {
				Station[keys[index]].remove();
				delete Station[keys[index]];
			}
		} else if (!TREM.Detector.webgl || TREM.MapRenderingEngine == "leaflet") {
			if (!Station[keys[index]] && (!rts_remove_eew || Alert))
				Station[keys[index]] = L.marker(
					[station[keys[index]].Lat, station[keys[index]].Long],
					{
						icon: L.divIcon({
							iconSize  : [size, size],
							className : `map-intensity-icon rt-icon ${level_class}`,
						}),
						keyboard: false,
					})
					.addTo(Maps.main)
					.bindTooltip(station_tooltip, {
						offset    : [8, 0],
						permanent : false,
						className : current_data == undefined ? "rt-station-tooltip-na" : "rt-station-tooltip",
					})
					.on("click", () => {
						// Station[keys[index]].keepTooltipAlive = !Station[keys[index]].keepTooltipAlive;

						// if (Maps.main.getZoom() < 11) {
						// 	const tooltip = Station[keys[index]].getTooltip();
						// 	Station[keys[index]].unbindTooltip();

						// 	if (Station[keys[index]].keepTooltipAlive)
						// 		tooltip.options.permanent = true;
						// 	else
						// 		tooltip.options.permanent = false;
						// 	Station[keys[index]].bindTooltip(tooltip);
						// }

						if (rtstation1 == "") {
							rtstation1 = keys[index];
							app.Configuration.data["Real-time.station"] = keys[index];
						} else if (rtstation1 == keys[index]) {
							rtstation1 = "";
							app.Configuration.data["Real-time.station"] = setting["Real-time.station"];
						} else if (rtstation1 != keys[index]) {
							rtstation1 = keys[index];
							app.Configuration.data["Real-time.station"] = keys[index];
						}
					});

			if (Station[keys[index]]) {
				if (Station[keys[index]].getIcon()?.options?.className != `map-intensity-icon rt-icon ${level_class}`)
					Station[keys[index]].setIcon(L.divIcon({
						iconSize  : [size, size],
						className : `map-intensity-icon rt-icon ${level_class}`,
					}));

				Station[keys[index]]
					.setZIndexOffset(2000 + ~~(amount * 10) + intensity * 500)
					.setTooltipContent(station_tooltip);
			}
		}

		const Level = IntensityI(intensity);

		// if (Unlock) {
		// 	if (rtstation1 == "") {
		// 		if (keys.includes(setting["Real-time.station"])) {
		// 			if (keys[index] == setting["Real-time.station"]) {
		// 				if (document.getElementById("rt-station").classList.contains("hide"))
		// 					document.getElementById("rt-station").classList.remove("hide");
		// 				document.getElementById("rt-station-local-intensity").className = `rt-station-intensity ${(amount < 999 && intensity != "NA") ? IntensityToClassString(intensity) : "na"}`;
		// 				document.getElementById("rt-station-local-id").innerText = keys[index];
		// 				document.getElementById("rt-station-local-name").innerText = station[keys[index]].Loc;
		// 				document.getElementById("rt-station-local-time").innerText = now.format("HH:mm:ss");
		// 				document.getElementById("rt-station-local-pga").innerText = amount;
		// 			}
		// 		} else {
		// 			document.getElementById("rt-station-local-intensity").className = "rt-station-intensity na";
		// 			document.getElementById("rt-station-local-id").innerText = TREM.Localization.getString("Realtime_No_Data");
		// 			document.getElementById("rt-station-local-name").innerText = TREM.Localization.getString("Realtime_No_Data");
		// 			document.getElementById("rt-station-local-time").innerText = "--:--:--";
		// 			document.getElementById("rt-station-local-pga").innerText = "--";
		// 		}
		// 	} else if (rtstation1 == keys[index]) {
		// 		document.getElementById("rt-station-local-intensity").className = `rt-station-intensity ${(amount < 999 && intensity != "NA") ? IntensityToClassString(intensity) : "na"}`;
		// 		document.getElementById("rt-station-local-id").innerText = keys[index];
		// 		document.getElementById("rt-station-local-name").innerText = station[keys[index]].Loc;
		// 		document.getElementById("rt-station-local-time").innerText = now.format("HH:mm:ss");
		// 		document.getElementById("rt-station-local-pga").innerText = amount;
		// 	}
		// } else
		if (rtstation1 == "") {
			if (keys.includes(setting["Real-time.station"])) {
				if (keys[index] == setting["Real-time.station"]) {
					if (document.getElementById("rt-station").classList.contains("hide"))
						document.getElementById("rt-station").classList.remove("hide");
					document.getElementById("rt-station-local-intensity").className = `rt-station-intensity ${(amount < 999 && intensity != "NA") ? IntensityToClassString(intensity) : "na"}`;
					document.getElementById("rt-station-local-id").innerText = keys[index];
					document.getElementById("rt-station-local-name").innerText = station[keys[index]].Loc;
					document.getElementById("rt-station-local-time").innerText = timeconvert(now).format("HH:mm:ss");
					document.getElementById("rt-station-local-pga").innerText = amount;
				}
			} else {
				document.getElementById("rt-station-local-intensity").className = "rt-station-intensity na";
				document.getElementById("rt-station-local-id").innerText = TREM.Localization.getString("Realtime_No_Data");
				document.getElementById("rt-station-local-name").innerText = TREM.Localization.getString("Realtime_No_Data");
				document.getElementById("rt-station-local-time").innerText = "--:--:--";
				document.getElementById("rt-station-local-pga").innerText = "--";
			}
		} else if (rtstation1 == keys[index]) {
			document.getElementById("rt-station-local-intensity").className = `rt-station-intensity ${(amount < 999 && intensity != "NA") ? IntensityToClassString(intensity) : "na"}`;
			document.getElementById("rt-station-local-id").innerText = keys[index];
			document.getElementById("rt-station-local-name").innerText = station[keys[index]].Loc;
			document.getElementById("rt-station-local-time").innerText = timeconvert(now).format("HH:mm:ss");
			document.getElementById("rt-station-local-pga").innerText = amount;
		}

		if (intensity != "NA" && NA999 != "Y" && NA0999 != "Y" && (intensity >= 0 && Alert) && amount < 999) {
			detected_list[station[keys[index]].PGA] ??= {
				intensity : intensity,
				time      : 0,
			};

			if ((detected_list[station[keys[index]].PGA].intensity ?? 0) < intensity)
				detected_list[station[keys[index]].PGA].intensity = intensity;

			if (Json.Alert) {
				if (setting["audio.realtime"])
					if (amount > 8 && PGALimit == 0) {
						PGALimit = 1;
						log("Playing Audio > pga1", 1, "Audio", "handler");
						dump({ level: 0, message: "Playing Audio > pga1", origin: "Audio" });
						TREM.Audios.pga1.play();
					} else if (amount > 250 && PGALimit > 1) {
						PGALimit = 2;
						log("Playing Audio > pga2", 1, "Audio", "handler");
						dump({ level: 0, message: "Playing Audio > pga2", origin: "Audio" });
						TREM.Audios.pga2.play();
					}

				detected_list[station[keys[index]].PGA].time = NOW().getTime();
			}
		} else if (Object.keys(detection_list).length) {
			for (let i = 0; i < Object.keys(detection_list).length; i++) {
				const key = Object.keys(detection_list)[i];

				if (max_intensity < detection_list[key]) max_intensity = detection_list[key];

				detected_list[key] ??= {
					intensity : detection_list[key],
					time      : NOW().getTime(),
				};

				if (detection_list[key] != detected_list[key].intensity) detected_list[key] = {
					intensity : detection_list[key],
					time      : NOW().getTime(),
				};
			}

			if (max_intensity > intensitytag) {
				if (setting["audio.realtime"]) {
					const loc = detection_location[0] ?? "未知區域";

					if (max_intensity > 4 || intensitytag > 4) {
						if (speecd_use) TREM.speech.speak({ text: `強震檢測，${loc}` });
						log("Playing Audio > int2", 1, "Audio", "handler");
						dump({ level: 0, message: "Playing Audio > int2", origin: "Audio" });
						TREM.Audios.int2.play();
						new Notification("🟥 強震檢測", {
							body   : `${loc}`,
							icon   : "../TREM.ico",
							silent : win.isFocused(),
						});
					} else if (max_intensity > 1 || intensitytag > 1) {
						if (speecd_use) TREM.speech.speak({ text: `震動檢測，${loc}` });
						log("Playing Audio > int1", 1, "Audio", "handler");
						dump({ level: 0, message: "Playing Audio > int1", origin: "Audio" });
						TREM.Audios.int1.play();
						new Notification("🟨 震動檢測", {
							body   : `${loc}`,
							icon   : "../TREM.ico",
							silent : win.isFocused(),
						});
					} else if (intensitytag == -1) {
						if (speecd_use) TREM.speech.speak({ text: `弱反應，${loc}` });
						log("Playing Audio > int0", 1, "Audio", "handler");
						dump({ level: 0, message: "Playing Audio > int0", origin: "Audio" });
						TREM.Audios.int0.play();
						new Notification("🟩 弱反應", {
							body   : `${loc}`,
							icon   : "../TREM.ico",
							silent : win.isFocused(),
						});
					}

					const _intensity = `${IntensityI(max_intensity)}級`;

					if (speecd_use) TREM.speech.speak({ text: `觀測最大震度，${_intensity.replace("-級", "弱").replace("+級", "強")}` });
				}

				setTimeout(() => {
					ipcRenderer.send("screenshotEEW", {
						Function : "station",
						ID       : 1,
						Version  : 1,
						Time     : NOW().getTime(),
						Shot     : 1,
					});
				}, 1250);

				if (setting["Real-time.show"]) win.showInactive();

				if (setting["Real-time.cover"])
					if (!win.isFullScreen()) {
						win.setAlwaysOnTop(true);
						win.focus();
						win.setAlwaysOnTop(false);
					}

				if (!win.isFocused()) win.flashFrame(true);
				intensitytag = max_intensity;
			}
		} else if (NA999 != "Y" && NA0999 != "Y" && intensitytest > -1 && amount < 999) {
			if (uuid.split("-")[2] == "7735548")
				current_station_data.PGA = 7735548;
			else if (uuid.split("-")[2] == "13379360")
				current_station_data.PGA = 13379360;

			if ((detected_list[current_station_data.PGA]?.intensity ?? -1) < intensitytest)
				if (setting["Real-time.alert"] && api_key_verify) {
					detected_list[current_station_data.PGA] ??= {
						intensity : intensitytest,
						time      : NOW().getTime(),
					};
					new Notification(`🐈 測站反應，${station[uuid].area}`, {
						body   : `${uuid}\nPGA: ${amount} gal 最大震度: ${IntensityI(intensitytest)}\n時間:${timeconvert(now).format("YYYY/MM/DD HH:mm:ss")}\n${station[uuid].Loc}`,
						icon   : "../TREM.ico",
						silent : win.isFocused(),
					});
					const _intensity = `${IntensityI(intensitytest)}級`;
					Json_temp[uuid.split("-")[2]].alert = true;
					Json_temp.Alert = true;

					if (speecd_use) TREM.speech.speak({ text: `測站反應，${station[uuid].area}` });

					if (speecd_use) TREM.speech.speak({ text: `最大震度，${_intensity.replace("-級", "弱").replace("+級", "強")}` });

					if ((detected_list[current_station_data.PGA].intensity ?? 0) < intensitytest)
						detected_list[current_station_data.PGA].intensity = intensitytest;

					if (Json_temp.area.length) Json_temp.area.push(station[uuid].area);
					else Json_temp.area = [station[uuid].area];

					TREM.MapArea2.setArea(Json_temp);

					setTimeout(() => {
						ipcRenderer.send("screenshotEEW", {
							Function : "station",
							ID       : 1,
							Version  : 1,
							Time     : NOW().getTime(),
							Shot     : 1,
						});
					}, 250);

					if (setting["Real-time.show"]) win.showInactive();

					if (setting["Real-time.cover"])
						if (!win.isFullScreen()) {
							win.setAlwaysOnTop(true);
							win.focus();
							win.setAlwaysOnTop(false);
						}

					if (!win.isFocused()) win.flashFrame(true);
				}

			intensitytag = -1;
		}

		if (MAXPGA.pga < amount && amount < 999 && Level != "NA") {
			MAXPGA.pga = amount;
			MAXPGA.station = keys[index];
			MAXPGA.level = Level;
			MAXPGA.lat = station[keys[index]].Lat;
			MAXPGA.long = station[keys[index]].Long;
			MAXPGA.loc = station[keys[index]].Loc;
			MAXPGA.intensity = intensity;
			MAXPGA.time = new Date(Json.Time);
		}
		// if (MaxIntensity1 > MAXPGA.intensity){
		// 	MAXPGA.pga = amount;
		// 	MAXPGA.station = keys[index];
		// 	MAXPGA.level = Level;
		// 	MAXPGA.lat = station[keys[index]].Lat;
		// 	MAXPGA.long = station[keys[index]].Long;
		// 	MAXPGA.loc = station[keys[index]].Loc;
		// 	MAXPGA.intensity = MaxIntensity1;
		// 	MAXPGA.time = new Date(Json_Time * 1000);
		// }
	}

	if (MAXPGA.station != "NA") {
		document.getElementById("rt-station-max-intensity").className = `rt-station-intensity ${(MAXPGA.pga < 999) ? IntensityToClassString(MAXPGA.intensity) : "na"}`;
		document.getElementById("rt-station-max-id").innerText = MAXPGA.station;
		document.getElementById("rt-station-max-name").innerText = MAXPGA.loc;
		document.getElementById("rt-station-max-time").innerText = timeconvert(MAXPGA.time).format("HH:mm:ss");
		document.getElementById("rt-station-max-pga").innerText = MAXPGA.pga;
	} else {
		document.getElementById("rt-station-max-intensity").className = "rt-station-intensity na";
		document.getElementById("rt-station-max-id").innerText = TREM.Localization.getString("Realtime_No_Data");
		document.getElementById("rt-station-max-name").innerText = TREM.Localization.getString("Realtime_No_Data");
		document.getElementById("rt-station-max-time").innerText = "--:--:--";
		document.getElementById("rt-station-max-pga").innerText = "--";
		document.getElementById("rt-station-local-intensity").className = "rt-station-intensity na";
		document.getElementById("rt-station-local-id").innerText = TREM.Localization.getString("Realtime_No_Data");
		document.getElementById("rt-station-local-name").innerText = TREM.Localization.getString("Realtime_No_Data");
		document.getElementById("rt-station-local-time").innerText = "--:--:--";
		document.getElementById("rt-station-local-pga").innerText = "--";
	}

	if (TREM.Detector.webgl || TREM.MapRenderingEngine == "mapbox-gl") {
		if (Object.keys(detected_list).length)
			for (let index = 0, pgaKeys = Object.keys(detected_list); index < pgaKeys.length; index++) {
				const Intensity = detected_list[pgaKeys[index]]?.intensity;

				if (RMTpgaTime == 0) {
					RMTpgaTime = NOW().getTime();
					console.log(RMTpgaTime);
				}

				if (Intensity == undefined) {
					delete detected_list[pgaKeys[index]];
					continue;
				}

				if (NOW().getTime() - detected_list[pgaKeys[index]].time > 30_000 || PGACancel) {
					TREM.MapArea.clear(pgaKeys[index]);
					delete detected_list[pgaKeys[index]];
					index--;
				} else if (NOW().getTime() - RMTpgaTime > 30_000) {
					delete detected_list[pgaKeys[index]];
					RMTpgaTime = 0;
					console.log(NOW().getTime());
					index--;
				} else if (!detected_list[pgaKeys[index]].passed) {
					let passed = false;

					if (Object.keys(eew).length)
						for (let Index = 0; Index < Object.keys(eew).length; Index++) {
							let SKIP = 0;

							for (let i = 0; i < 4; i++) {
								const dis = Math.sqrt(Math.pow((TREM.Resources.area[pgaKeys[index].toString()][i][0] - eew[Object.keys(eew)[Index]].lat) * 111, 2) + Math.pow((TREM.Resources.area[pgaKeys[index].toString()][i][1] - eew[Object.keys(eew)[Index]].lon) * 101, 2));

								if (eew[Object.keys(eew)[Index]].km / 1000 > dis) SKIP++;
							}

							if (SKIP >= 4) {
								passed = true;
								break;
							}
						}

					if (passed) {
						detected_list[pgaKeys[index]].passed = true;
						TREM.MapArea.clear(pgaKeys[index]);
					} else {
						TREM.MapArea.setArea(pgaKeys[index], Intensity);
					}
				}
			}
		else if (TREM.MapArea.isVisible)
			TREM.MapArea.clear();

		if (!Object.keys(detected_list).length) PGACancel = false;
	} else if (!TREM.Detector.webgl || TREM.MapRenderingEngine == "leaflet") {
		if (Object.keys(detected_box_list).length)
			for (let index = 0; index < Object.keys(detected_box_list).length; index++) {
				if (RMT == 0) Maps.main.removeLayer(detected_box_list[Object.keys(detected_box_list)[index]]);
				delete detected_box_list[Object.keys(detected_box_list)[index]];
				index--;
			}

		if (NOW().getTime() - RMTpgaTime > 30_000)
			RMT = 0;
		else
			RMT++;

		if (Object.keys(detected_list).length)
			for (let index = 0; index < Object.keys(detected_list).length; index++) {
				const Intensity = detected_list[Object.keys(detected_list)[index]].intensity;
				const time = detected_list[Object.keys(detected_list)[index]].time;

				if (RMTpgaTime == 0) {
					RMTpgaTime = NOW().getTime();
					console.log(RMTpgaTime);
				}

				if (time != 0 && NOW().getTime() - time > 30_000 || PGACancel) {
					delete detected_list[Object.keys(detected_list)[index]];
					index--;
				} else if (NOW().getTime() - RMTpgaTime > 30_000) {
					delete detected_list[Object.keys(detected_list)[index]];
					RMTpgaTime = 0;
					console.log(NOW().getTime());
					index--;
				} else {
					detected_box_list[Object.keys(detected_list)[index]] = L.polygon(TREM.Resources.area[Object.keys(detected_list)[index].toString()], {
						color     : TREM.color(Intensity),
						fillColor : "transparent",
					});
					let skip = false;

					if (Object.keys(eew).length != 0)
						for (let Index = 0; Index < Object.keys(eew).length; Index++) {
							let SKIP = 0;

							for (let i = 0; i < 4; i++) {
								const dis = Math.sqrt(Math.pow((TREM.Resources.area[Object.keys(detected_list)[index].toString()][i][0] - eew[Object.keys(eew)[Index]].lat) * 111, 2) + Math.pow((TREM.Resources.area[Object.keys(detected_list)[index].toString()][i][1] - eew[Object.keys(eew)[Index]].lon) * 101, 2));

								if (eew[Object.keys(eew)[Index]].km / 1000 > dis) SKIP++;
							}

							if (SKIP >= 4) {
								skip = true;
								break;
							}
						}

					if (skip) continue;

					if (RMT >= 2) Maps.main.addLayer(detected_box_list[Object.keys(detected_list)[index]]);
				}
			}

		if (!Object.keys(detected_list).length) PGACancel = false;

		if (RMT >= 2) RMT = 0;
	}

	const All = (Json.Alert && Json.I && Json.I.length) ? Json.I : [];
	const list = [];

	if (!All.length) {
		PGAtag = -1;
		PGALimit = 0;
	} else {
		for (let index = 0; index < All.length; index++) {
			if (station[All[index].uuid] == undefined) continue;
			All[index].loc = station[All[index].uuid].Loc;
		}

		if (All[0].intensity > PGAtag) {
			if (setting["audio.realtime"])
				if (All[0].intensity >= 5 && PGAtag < 5) {
					log("Playing Audio > int2", 1, "Audio", "handler");
					dump({ level: 0, message: "Playing Audio > int2", origin: "Audio" });
					TREM.Audios.int2.play();
				} else if (All[0].intensity >= 2 && PGAtag < 2) {
					log("Playing Audio > int1", 1, "Audio", "handler");
					dump({ level: 0, message: "Playing Audio > int1", origin: "Audio" });
					TREM.Audios.int1.play();
				} else if (PGAtag == -1) {
					log("Playing Audio > int0", 1, "Audio", "handler");
					dump({ level: 0, message: "Playing Audio > int0", origin: "Audio" });
					TREM.Audios.int0.play();
				}

			setTimeout(() => {
				ipcRenderer.send("screenshotEEW", {
					Function : "station",
					ID       : 1,
					Version  : 1,
					Time     : NOW().getTime(),
					Shot     : 1,
				});
			}, 1250);
			changeView("main", "#mainView_btn");

			if (setting["Real-time.show"]) win.showInactive();

			if (setting["Real-time.cover"])
				if (!win.isFullScreen()) {
					win.setAlwaysOnTop(true);
					win.focus();
					win.setAlwaysOnTop(false);
				}

			if (!win.isFocused()) win.flashFrame(true);
			PGAtag = All[0].intensity;
		}

		let count = 0;

		if (All.length <= 8) {
			for (let Index = 0; Index < All.length; Index++, count++) {
				if (All[Index].loc == undefined) continue;

				if (count >= 8) break;
				const container = document.createElement("DIV");
				container.className = IntensityToClassString(All[Index].intensity);
				const location = document.createElement("span");
				location.innerText = `${All[Index].loc}\n${Json[All[Index].uuid.split("-")[2]].v} gal`;
				container.appendChild(document.createElement("span"));
				container.appendChild(location);
				list.push(container);
			}
		} else {
			const Idata = {};

			for (let Index = 0; Index < All.length; Index++, count++) {
				if (All[Index].loc == undefined) continue;

				if (Object.keys(Idata).length >= 8) break;
				const city = All[Index].loc.split(" ")[0];
				const CPGA = (Idata[city] == undefined) ? 0 : Idata[city];

				if (Json[All[Index].uuid.split("-")[2]]?.v > CPGA) {
					if (Idata[city] == undefined) Idata[city] = {};
					Idata[city].pga = Json[All[Index].uuid.split("-")[2]].v;
					Idata[city].intensity = All[Index].intensity;
				}
			}

			for (let index = 0; index < Object.keys(Idata).length; index++) {
				const container = document.createElement("DIV");
				container.className = IntensityToClassString(Idata[Object.keys(Idata)[index]].intensity);
				const location = document.createElement("span");
				location.innerText = `${Object.keys(Idata)[index]}\n${Idata[Object.keys(Idata)[index]].pga} gal`;
				container.appendChild(document.createElement("span"));
				container.appendChild(location);
				list.push(container);
			}
		}
	}

	// document.getElementById("rt-maxintensity").className = MaxPGA < 999 ? IntensityToClassString(MaxIntensity1) : "na";
	document.getElementById("rt-list").replaceChildren(...list);
}

async function fetchFiles() {
	try {
		Location = await (await fetch("https://raw.githubusercontent.com/ExpTechTW/TW-EEW/master/locations.json")).json();
		log("Get Location File", 1, "Location", "fetchFiles");
		dump({ level: 0, message: "Get Location File", origin: "Location" });

		if (setting["Real-time.local"]) {
			station = require(path.resolve(__dirname, "../station.json"));
			log("Get Local Station File", 1, "Location", "fetchFiles");
			dump({ level: 0, message: "Get Local Station File", origin: "Location" });
		} else {
			station = await (await fetch("https://raw.githubusercontent.com/ExpTechTW/API/master/Json/earthquake/station.json")).json();
			log("Get Station File", 1, "Location", "fetchFiles");
			dump({ level: 0, message: "Get Station File", origin: "Location" });
		}

		PGAMain();
	} catch (err) {
		log(err, 3, "Location", "fetchFiles");
		dump({ level: 2, message: err, origin: "Location" });
		console.log(err);
		await fetchFilesbackup();
	}
}

async function fetchFilesbackup() {
	try {
		Location = await (await fetch("https://exptech.com.tw/api/v1/file?path=/resource/locations.json")).json();
		log("Get Location backup File", 1, "Location", "fetchFilesbackup");
		dump({ level: 0, message: "Get Location backup File", origin: "Location" });

		if (setting["Real-time.local"]) {
			station = require(path.resolve(__dirname, "../station.json"));
			log("Get Local Station File", 1, "Location", "fetchFiles");
			dump({ level: 0, message: "Get Local Station File", origin: "Location" });
		} else {
			station = await (await fetch("https://exptech.com.tw/api/v1/file?path=/resource/station.json")).json();
			log("Get Station backup File", 1, "Location", "fetchFilesbackup");
			dump({ level: 0, message: "Get Station backup File", origin: "Location" });
		}

		PGAMain();
	} catch (err) {
		console.log(err);
		log(err, 3, "Location", "fetchFilesbackup");
		dump({ level: 2, message: err, origin: "Location" });
		await fetchFiles();
	}
}

// #region 用戶所在位置
/**
 * 設定用戶所在位置
 * @param {string} town 鄉鎮
 */
async function setUserLocationMarker(town, errcode = false) {
	if (!Location)
		if (!errcode)
			try {
				Location = await (await fetch("https://raw.githubusercontent.com/ExpTechTW/TW-EEW/master/locations.json")).json();
				log("Get Location File 0", 1, "Location", "setUserLocationMarker");
				dump({ level: 0, message: "Get Location File 0", origin: "Location" });
			} catch (err) {
				console.log(err);
				log(err, 3, "Location", "setUserLocationMarker");
				dump({ level: 2, message: err, origin: "Location" });
				await setUserLocationMarker(town, true);
			}
		else
			try {
				Location = await (await fetch("https://exptech.com.tw/api/v1/file?path=/resource/locations.json")).json();
				log("Get Location backup File 0", 1, "Location", "setUserLocationMarker");
				dump({ level: 0, message: "Get Location backup File 0", origin: "Location" });
			} catch (err) {
				console.log(err);
				log(err, 3, "Location", "setUserLocationMarker");
				dump({ level: 2, message: err, origin: "Location" });
				await setUserLocationMarker(town);
			}

	if (setting["location.lat"] != "" && setting["location.lon"] != "")
		[
			, UserLocationLat,
			UserLocationLon,
		] = [
			null,
			setting["location.lat"],
			setting["location.lon"],
		];
	else
		[
			, UserLocationLat,
			UserLocationLon,
		] = Location[setting["location.city"]][town];

	if (!marker) {
		if (TREM.Detector.webgl || TREM.MapRenderingEngine == "mapbox-gl")
			marker = new maplibregl.Marker({
				element: $("<img id=\"here-marker\" src=\"../image/here.png\" height=\"20\" width=\"20\" style=\"z-index: 5000;\"></img>")[0],
			})
				.setLngLat([UserLocationLon, UserLocationLat])
				.addTo(Maps.main);
		else if (TREM.MapRenderingEngine == "leaflet")
			marker = L.marker([UserLocationLat, UserLocationLon], {
				icon     : L.divIcon({ html: "<img id=\"here-marker\" src=\"../image/here.png\" height=\"20\" width=\"20\" style=\"z-index: 5000;\"></img>" }),
				keyboard : false,
			})
				.addTo(Maps.main);
	} else if (TREM.MapRenderingEngine == "mapbox-gl") {
		marker.setLngLat([UserLocationLon, UserLocationLat]);
	} else if (TREM.MapRenderingEngine == "leaflet") {
		marker.setLatLng([UserLocationLat, UserLocationLon]);
	}

	log(`User location set to ${setting["location.city"]} ${town} (${UserLocationLat}, ${UserLocationLon})`, 1, "Location", "setUserLocationMarker");
	dump({ level: 0, message: `User location set to ${setting["location.city"]} ${town} (${UserLocationLat}, ${UserLocationLon})`, origin: "Location" });

	if (!TREM.Detector.webgl)
		// Maps.main.fitBounds([[25.35, 119.65], [21.85, 124.05]]);
		Maps.main.setView([23.608428, 120.799168], 7.75);
}
// #endregion

// #region 聚焦
TREM.Earthquake.on("focus", ({ bounds, center, zoom, options = {} } = {}, jump = false) => {

	if (TREM.Detector.webgl || TREM.MapRenderingEngine == "mapbox-gl") {
		if (bounds)
			Maps.main.fitBounds(bounds, {
				...options,
				animate: !jump,
			});
		else if (center)
			if (jump)
				if (zoom)
					Maps.main.jumpTo({ center, zoom });
				else
					Maps.main.jumpTo({ center });
			else if (zoom)
				Maps.main.easeTo({
					center,
					zoom,
					...options,
				});
			else
				Maps.main.easeTo({
					center,
					...options,
				});

	} else if (!TREM.Detector.webgl || TREM.MapRenderingEngine == "leaflet") {
		if (center) {
			let X = 0;

			if (zoom >= 6) X = 2.5;

			if (zoom >= 6.5) X = 1.6;

			if (zoom >= 7) X = 1.5;

			if (zoom >= 7.5) X = 0.9;

			if (zoom >= 8) X = 0.6;

			if (zoom >= 8.5) X = 0.4;

			if (zoom >= 9) X = 0.35;

			if (zoom >= 9.5) X = 0.2;

			Focus[0] = center[0];
			Focus[1] = center[1] + X;
			Focus[2] = zoom;

			if (Maps.main.getBounds().getCenter().lat.toFixed(2) != center[0].toFixed(2) || Maps.main.getBounds().getCenter().lng.toFixed(2) != (center[1] + X).toFixed(2) || zoom != Maps.main.getZoom())
				Maps.main.setView([center[0], center[1]], zoom);
		} else if (Focus.length != 0) {
			if (Maps.main.getBounds().getCenter().lat.toFixed(2) != Focus[0].toFixed(2) || Maps.main.getBounds().getCenter().lng.toFixed(2) != Focus[1].toFixed(2) || Focus[2] != Maps.main.getZoom())
				Maps.main.setView([Focus[0], Focus[1]], Focus[2]);
		}
	}
});

function Mapsmainfocus() {
	if (TREM.Detector.webgl || TREM.MapRenderingEngine == "mapbox-gl") {
		const camera = Maps.main.cameraForBounds(new maplibregl.LngLatBounds([ 118.25, 21.77 ], [ 122.18, 25.47 ]));
		TREM.Earthquake.emit("focus", {
			...camera,
			options: {
				padding  : { top: 0, right: Maps.main.getCanvas().width / 6, bottom: 0, left: 0 },
				speed    : 2,
				curve    : 1,
				easing   : (e) => Math.sin(e * Math.PI / 2),
				duration : 1000,
			},
		});
	} else if (!TREM.Detector.webgl || TREM.MapRenderingEngine == "leaflet") {
		TREM.Earthquake.emit("focus", { center: pointFormatter(23.608428, 120.799168, TREM.MapRenderingEngine), zoom: 7.75 });
	}
}

// #endregion

// #region 音頻播放
let AudioT;
let AudioT1;
const audioDOM = new Audio();
const audioDOM1 = new Audio();
audioDOM.addEventListener("ended", () => {
	audio.main_lock = false;
});
audioDOM1.addEventListener("ended", () => {
	audio.minor_lock = false;
});

function audioPlay(src) {
	audio.main.push(src);

	if (!AudioT)
		AudioT = setInterval(() => {
			if (!audio.main_lock) {
				audio.main_lock = true;

				if (audio.main.length) {
					playNextAudio();
				} else {
					clearInterval(AudioT);
					audio.main_lock = false;
					AudioT = null;
				}
			}
		}, 0);
}

function audioPlay1(src) {
	audio.minor.push(src);

	if (!AudioT1)
		AudioT1 = setInterval(() => {
			if (!audio.minor_lock) {
				audio.minor_lock = true;

				if (audio.minor.length) {
					playNextAudio1();
				} else {
					clearInterval(AudioT1);
					audio.minor_lock = false;
					AudioT1 = null;
				}
			}
		}, 0);
}

function playNextAudio() {
	audio.main_lock = true;
	const nextAudioPath = audio.main.shift();
	audioDOM.src = nextAudioPath;

	if (nextAudioPath.startsWith("../audio/1/") && setting["audio.eew"]) {
		log(`Playing Audio > ${nextAudioPath}`, 1, "Audio", "playNextAudio");
		dump({ level: 0, message: `Playing Audio > ${nextAudioPath}`, origin: "Audio" });
		audioDOM.play();
	} else if (!nextAudioPath.startsWith("../audio/1/")) {
		log(`Playing Audio > ${nextAudioPath}`, 1, "Audio", "playNextAudio");
		dump({ level: 0, message: `Playing Audio > ${nextAudioPath}`, origin: "Audio" });
		audioDOM.play();
	}
}

function playNextAudio1() {
	audio.minor_lock = true;
	const nextAudioPath = audio.minor.shift();
	audioDOM1.src = nextAudioPath;
	audioDOM1.playbackRate = 1.1;

	if (nextAudioPath.startsWith("../audio/1/") && setting["audio.eew"]) {
		log(`Playing Audio 1 > ${nextAudioPath}`, 1, "Audio", "playNextAudio1");
		dump({ level: 0, message: `Playing Audio 1 > ${nextAudioPath}`, origin: "Audio" });
		audioDOM1.play();
	} else if (!nextAudioPath.startsWith("../audio/1/")) {
		log(`Playing Audio 1 > ${nextAudioPath}`, 1, "Audio", "playNextAudio1");
		dump({ level: 0, message: `Playing Audio 1 > ${nextAudioPath}`, origin: "Audio" });
		audioDOM1.play();
	}
}
// #endregion

// #region Report Data
function ReportGET() {
	try {
		const controller = new AbortController();
		setTimeout(() => {
			controller.abort();
		}, 2500);

		if (!localStorage.fixReportGET_0) {
			localStorage.fixReportGET_0 = 1;
			storage.setItem("report_data", []);
		}

		let _report_data = [];
		_report_data = storage.getItem("report_data");

		if (typeof _report_data != "object") _report_data = [];

		if (_report_data == null) _report_data = [];

		const list = {};
		let _report_data_temp = [];
		let j = 0;

		if (_report_data.length != 0 && !setting["report.getInfo"]) {
			for (let i = 0; i < _report_data.length; i++)
				if (_report_data[i].identifier.startsWith("CWB")) {
					_report_data_temp[j] = _report_data[i];
					j += 1;
				}

			_report_data = _report_data_temp;
		}

		if (_report_data.length != 0)
			for (let i = 0; i < 49; i++) {
				const md5 = crypto.createHash("md5");
				list[_report_data[i].identifier] = md5.update(JSON.stringify(_report_data[i])).digest("hex");
			}

		let bodyInfo;

		if (setting["report.getInfo"])
			bodyInfo = JSON.stringify({ list, key: setting["api.key"] != "" ? setting["api.key"] : "" });
		else if (setting["api.key"] != "")
			bodyInfo = JSON.stringify({ list, key: setting["api.key"] });
		else
			bodyInfo = JSON.stringify({ list });

		fetch("https://exptech.com.tw/api/v3/earthquake/reports", {
			method  : "post",
			headers : {
				Accept         : "application/json",
				"Content-Type" : "application/json",
			},
			body   : bodyInfo,
			signal : controller.signal })
			.then((ans) => ans.json())
			.then((ans) => {
				api_key_verify = false;

				for (let i = 0; i < ans.length; i++) {
					const id = ans[i].identifier;

					for (let _i = 0; _i < _report_data.length; _i++)
						if (_report_data[_i].identifier == id) {
							_report_data.splice(_i, 1);
							break;
						}
				}

				for (let i = 0; i < ans.length; i++) {
					_report_data.push(ans[i]);

					if (ans[i].location.startsWith("地震資訊"))
						api_key_verify = true;
				}

				for (let i = 0; i < _report_data.length - 1; i++)
					for (let _i = 0; _i < _report_data.length - 1; _i++)
						if (new Date(_report_data[_i].originTime.replaceAll("/", "-")).getTime() < new Date(_report_data[_i + 1].originTime.replaceAll("/", "-")).getTime()) {
							const temp = _report_data[_i + 1];
							_report_data[_i + 1] = _report_data[_i];
							_report_data[_i] = temp;
						}

				if (!_report_data) return setTimeout(ReportGET, 10_000);

				storage.setItem("report_data", _report_data);

				if (api_key_verify && setting["report.getInfo"]) {
					log("Reports fetched (api key verify)", 1, "EQReportFetcher", "ReportGET");
					dump({ level: 0, message: "Reports fetched (api key verify)", origin: "EQReportFetcher" });
					cacheReport(_report_data);
				} else {
					const _report_data_POST_temp = [];
					let k = 0;

					for (let i = 0; i < _report_data.length; i++)
						if (_report_data[i].identifier.startsWith("CWB")) {
							_report_data_POST_temp[k] = _report_data[i];
							k += 1;
						}

					log("Reports fetched", 1, "EQReportFetcher", "ReportGET");
					dump({ level: 0, message: "Reports fetched", origin: "EQReportFetcher" });
					cacheReport(_report_data_POST_temp);
				}
			})
			.catch((err) => {
				console.log(err);
				log("Error fetching reports (fetch)", 3, "EQReportFetcher", "ReportGET");
				log(err, 3, "EQReportFetcher", "ReportGET");
				dump({ level: 2, message: "Error fetching reports (fetch)", origin: "EQReportFetcher" });
				dump({ level: 2, message: err, origin: "EQReportFetcher" });

				if (_report_data.length > setting["cache.report"]) {
					_report_data_temp = [];
					for (let i = 0; i < setting["cache.report"]; i++)
						_report_data_temp[i] = _report_data[i];
					TREM.Report.cache = new Map(_report_data_temp.map(v => [v.identifier, v]));
					ReportList(_report_data_temp);
				} else {
					TREM.Report.cache = new Map(_report_data.map(v => [v.identifier, v]));
					ReportList(_report_data);
				}

				return setTimeout(() => {
					ReportGET();
				}, 10_000);
			});
		report_get_timestamp = Date.now();
	} catch (error) {
		console.log(error);
		log("Error fetching reports (try)", 3, "EQReportFetcher", "ReportGET");
		log(error, 3, "EQReportFetcher", "ReportGET");
		dump({ level: 2, message: "Error fetching reports (try)", origin: "EQReportFetcher" });
		dump({ level: 2, message: error, origin: "EQReportFetcher" });
		return setTimeout(() => {
			ReportGET();
		}, 10_000);
	}
}

ipcMain.on("ReportGET", () => {
	let _report_data_GET = [];
	const _report_data_GET_temp = [];
	let j = 0;
	let getInfo = false;
	_report_data_GET = storage.getItem("report_data");

	if (typeof _report_data_GET != "object") _report_data_GET = [];

	if (_report_data_GET.length != 0 && !setting["report.getInfo"]) {
		for (let i = 0; i < _report_data_GET.length; i++)
			if (_report_data_GET[i].identifier.startsWith("CWB")) {
				_report_data_GET_temp[j] = _report_data_GET[i];
				j += 1;
			}

		cacheReport(_report_data_GET_temp);
	} else if (_report_data_GET.length != 0 && setting["report.getInfo"]) {
		if (api_key_verify) {
			for (let i = 0; i < _report_data_GET.length; i++)
				if (_report_data_GET[i].location.startsWith("地震資訊"))
					getInfo = true;

			if (!getInfo) ReportGET();
			else if (getInfo) cacheReport(_report_data_GET);
		} else {
			for (let i = 0; i < _report_data_GET.length; i++)
				if (_report_data_GET[i].identifier.startsWith("CWB")) {
					_report_data_GET_temp[j] = _report_data_GET[i];
					j += 1;
				}

			if (setting["api.key"] != "") ReportGET();
			else cacheReport(_report_data_GET_temp);
		}
	}
});

ipcMain.on("ReportTREM", () => {
	TREM.Report.report_trem = setting["report.trem"];

	if (TREM.Report.view == "report-overview" || TREM.Report.view == "eq-report-overview")
		if (TREM.Detector.webgl || TREM.MapRenderingEngine == "mapbox-gl") {
			if (TREM.Report.report_trem && TREM.Report._markers.length != 0) {
				TREM.Report._setuptremget(TREM.Report._report_Temp);
			} else if (!TREM.Report.report_trem && TREM.Report._markers.length != 0) {
				let Station_i0 = 0;

				if (TREM.Report._markers.length) {
					for (const marker0 of TREM.Report._markers)
						marker0.remove();
					TREM.Report._markers = [];
				}

				TREM.Report.epicenterIcon.addTo(Maps.report);
				TREM.Report._markers.push(TREM.Report.epicenterIcon);

				for (let index = 0, keys = Object.keys(TREM.Report.report_station), n = keys.length; index < n; index++) {
					TREM.Report.report_station[Station_i0].addTo(Maps.report);
					TREM.Report._markers.push(TREM.Report.report_station[Station_i0]);
					Station_i0 += 1;
				}

				TREM.Report._setupzoomPredict();
			}
		} else if (!TREM.Detector.webgl || TREM.MapRenderingEngine == "leaflet") {
			if (TREM.Report.report_trem && TREM.Report._markersGroup) {
				TREM.Report._setuptremget(TREM.Report._report_Temp);
			} else if (!TREM.Report.report_trem && TREM.Report._markersGroup) {
				TREM.Report._markersGroup.removeFrom(Maps.report);

				let Station_i0 = 0;

				if (TREM.Report._markers.length) {
					for (const marker1 of TREM.Report._markers)
						marker1.remove();
					TREM.Report._markers = [];
				}

				TREM.Report.epicenterIcon.addTo(Maps.report);
				TREM.Report._markers.push(TREM.Report.epicenterIcon);

				for (let index = 0, keys = Object.keys(TREM.Report.report_station), n = keys.length; index < n; index++) {
					TREM.Report._markers.push(TREM.Report.report_station[Station_i0]);
					Station_i0 += 1;
				}

				TREM.Report._markersGroup = L.featureGroup(TREM.Report._markers).addTo(Maps.report);
				TREM.Report._setupzoomPredict();
			}
		}
});

function cacheReport(_report_data_GET) {
	if (_report_data_GET.length > setting["cache.report"]) {
		const _report_data_temp = [];

		for (let i = 0; i < setting["cache.report"]; i++)
			_report_data_temp[i] = _report_data_GET[i];

		TREM.Report.cache = new Map(_report_data_temp.map(v => [v.identifier, v]));

		if (Report != 0)
			ReportList(_report_data_temp, {
				Max  : TREM.MapIntensity.MaxI,
				Time : timeconvert(new Date(Report)).format("YYYY/MM/DD HH:mm:ss"),
			});
		else
			ReportList(_report_data_temp);
	} else {
		TREM.Report.cache = new Map(_report_data_GET.map(v => [v.identifier, v]));

		if (Report != 0)
			ReportList(_report_data_GET, {
				Max  : TREM.MapIntensity.MaxI,
				Time : timeconvert(new Date(Report)).format("YYYY/MM/DD HH:mm:ss"),
			});
		else
			ReportList(_report_data_GET);
	}
}
// #endregion

// #region Report 點擊
// eslint-disable-next-line no-shadow
const openURL = url => {
	shell.openExternal(url);
};
// #endregion

// #region Report list
function ReportList(earthquakeReportArr, palert) {
	roll.replaceChildren();

	if (palert != undefined) {
		const palertReportArr = { Max: palert.Max, Time: palert.Time, data: [], location: "", ID: [], earthquakeNo: 0, originTime: palert.Time };
		addReport(palertReportArr, false, 0);
	}

	for (let index = 0; index < earthquakeReportArr.length; index++)
		addReport(earthquakeReportArr[index], false, index + 1);

	setLocale(setting["general.locale"]);
}

function addReport(report, prepend = false, index = 0) {
	if (replay != 0 && new Date(report.originTime).getTime() > new Date(replay + (NOW().getTime() - replayT)).getTime()) return;

	const Level = IntensityI(report.data[0]?.areaIntensity);
	// if (setting["api.key"] == "" && Level == "?") return;
	let msg = "";

	if (report.location.includes("("))
		msg = report.location.substring(report.location.indexOf("(") + 1, report.location.indexOf(")")).replace("位於", "");
	else
		msg = report.location;

	let star = "";

	if (report.ID.length != 0) star += "↺ ";

	if (report.earthquakeNo % 1000 != 0) star += "✩ ";

	const Div = document.createElement("div");
	Div.className = "md3-ripple ";

	if (report.Time != undefined && report.Max != undefined) {
		const report_container = document.createElement("div");
		report_container.className = "report-container locating";
		const report_intensity_container = document.createElement("div");
		report_intensity_container.className = "report-intensity-container";

		const report_intensity_title_container = document.createElement("div");
		report_intensity_title_container.className = "report-intensity-title-container";

		const report_intensity_title_en = document.createElement("span");
		report_intensity_title_en.lang = "en";
		report_intensity_title_en.className = "report-intensity-title";
		report_intensity_title_en.innerText = "Max Int.";
		const report_intensity_title_ja = document.createElement("span");
		report_intensity_title_ja.lang = "ja";
		report_intensity_title_ja.className = "report-intensity-title";
		report_intensity_title_ja.innerText = "最大震度";
		const report_intensity_title_kr = document.createElement("span");
		report_intensity_title_kr.lang = "kr";
		report_intensity_title_kr.className = "report-intensity-title";
		report_intensity_title_kr.innerText = "최대진도";
		const report_intensity_title_ru = document.createElement("span");
		report_intensity_title_ru.lang = "ru";
		report_intensity_title_ru.className = "report-intensity-title";
		report_intensity_title_ru.innerText = "Макс интенси";
		report_intensity_title_ru.style = "font-size: 14px;line-height: 14px";
		const report_intensity_title_zh_tw = document.createElement("span");
		report_intensity_title_zh_tw.lang = "zh-TW";
		report_intensity_title_zh_tw.className = "report-intensity-title";
		report_intensity_title_zh_tw.innerText = "最大震度";
		const report_intensity_title_zh_cn = document.createElement("span");
		report_intensity_title_zh_cn.lang = "zh-CN";
		report_intensity_title_zh_cn.className = "report-intensity-title";
		report_intensity_title_zh_cn.innerText = "最大震度";

		report_intensity_title_container.append(report_intensity_title_en, report_intensity_title_ja, report_intensity_title_kr, report_intensity_title_ru, report_intensity_title_zh_tw, report_intensity_title_zh_cn);
		report_intensity_title_container.childNodes.forEach((node) => node.style.display = node.lang == setting["general.locale"] ? "unset" : "none");

		const report_intensity_value = document.createElement("span");
		report_intensity_value.className = "report-intensity-value";
		report_intensity_value.innerText = IntensityI(report.Max);
		report_intensity_container.append(report_intensity_title_container, report_intensity_value);

		const report_detail_container = document.createElement("div");
		report_detail_container.className = "report-detail-container";

		const report_PAlert = document.createElement("span");
		report_PAlert.className = "report-PAlert";
		report_PAlert.innerText = "來源 P-Alert";
		const report_location = document.createElement("span");
		report_location.className = "report-location";
		report_location.innerText = "震源 調查中";
		const report_time = document.createElement("span");
		report_time.className = "report-time";
		report_time.innerText = report.Time.replace(/-/g, "/");
		report_detail_container.append(report_PAlert, report_location, report_time);

		report_container.append(report_intensity_container, report_detail_container);
		Div.prepend(report_container);
		Div.className += IntensityToClassString(report.Max);
		ripple(Div);
		roll.prepend(Div);
		investigation = true;
	} else {
		const timed = new Date(report.originTime.replace(/-/g, "/")).getTime() - 25000;
		const timed_hold = timed;
		fs.access(`./replay_data/${timed_hold}/${timed}.json`, (err) => {
			if (!err) {
				report.download = true;
				TREM.Report.cache.set(report.identifier, report);
			} else {
				report.download = false;
				TREM.Report.cache.set(report.identifier, report);
			}
		});

		const report_container = document.createElement("div");
		report_container.className = "report-container";

		const report_intensity_container = document.createElement("div");
		report_intensity_container.className = "report-intensity-container";

		const report_intensity_title_container = document.createElement("div");
		report_intensity_title_container.className = "report-intensity-title-container";

		const report_intensity_title_en = document.createElement("span");
		report_intensity_title_en.lang = "en";
		report_intensity_title_en.className = "report-intensity-title";
		report_intensity_title_en.innerText = "Max Int.";
		const report_intensity_title_ja = document.createElement("span");
		report_intensity_title_ja.lang = "ja";
		report_intensity_title_ja.className = "report-intensity-title";
		report_intensity_title_ja.innerText = "最大震度";
		const report_intensity_title_kr = document.createElement("span");
		report_intensity_title_kr.lang = "kr";
		report_intensity_title_kr.className = "report-intensity-title";
		report_intensity_title_kr.innerText = "최대진도";
		const report_intensity_title_ru = document.createElement("span");
		report_intensity_title_ru.lang = "ru";
		report_intensity_title_ru.className = "report-intensity-title";
		report_intensity_title_ru.innerText = "Макс интенси";
		report_intensity_title_ru.style = "font-size: 14px;line-height: 14px";
		const report_intensity_title_zh_tw = document.createElement("span");
		report_intensity_title_zh_tw.lang = "zh-TW";
		report_intensity_title_zh_tw.className = "report-intensity-title";
		report_intensity_title_zh_tw.innerText = "最大震度";
		const report_intensity_title_zh_cn = document.createElement("span");
		report_intensity_title_zh_cn.lang = "zh-CN";
		report_intensity_title_zh_cn.className = "report-intensity-title";
		report_intensity_title_zh_cn.innerText = "最大震度";

		report_intensity_title_container.append(report_intensity_title_en, report_intensity_title_ja, report_intensity_title_kr, report_intensity_title_ru, report_intensity_title_zh_tw, report_intensity_title_zh_cn);
		report_intensity_title_container.childNodes.forEach((node) => node.style.display = node.lang == setting["general.locale"] ? "unset" : "none");

		const report_intensity_value = document.createElement("span");
		report_intensity_value.className = "report-intensity-value";
		report_intensity_value.innerText = Level;
		report_intensity_container.append(report_intensity_title_container, report_intensity_value);

		const report_detail_container = document.createElement("div");
		report_detail_container.className = "report-detail-container";

		const report_location = document.createElement("span");
		report_location.className = "report-location";
		report_location.innerText = `${star}${msg}`;

		if (msg.length > 9 && index != 0) report_location.style = "font-size: 16px;";

		if (msg.length > 10 && index != 0) report_location.style = "font-size: 14px;";

		if (msg.length > 12 && index != 0) report_location.style = "font-size: 12px;";

		if (msg.length > 9 && index == 0) report_location.style = "font-size: 20px;";

		if (msg.length > 10 && index == 0) report_location.style = "font-size: 18px;";

		if (msg.length > 12 && index == 0) report_location.style = "font-size: 16px;";
		const report_time = document.createElement("span");
		report_time.className = "report-time";
		report_time.innerText = report.originTime.replace(/-/g, "/");
		const report_magnitude = document.createElement("span");
		report_magnitude.className = "report-magnitude";
		report_magnitude.innerText = report.magnitudeValue.toFixed(1);
		const report_depth = document.createElement("span");
		report_depth.className = "report-depth";
		report_depth.innerText = report.depth;
		report_detail_container.append(report_location, report_time, report_magnitude, report_depth);

		report_container.append(report_intensity_container, report_detail_container);
		ripple(Div);
		Div.append(report_container);
		Div.className += IntensityToClassString(report.data[0]?.areaIntensity);
		Div.addEventListener("click", () => {
			if (replay != 0) return;
			TREM.set_report_overview = 1;
			TREM.Report.setView("eq-report-overview", report);
			changeView("report", "#reportView_btn");
			ReportTag = NOW().getTime();
			console.log("ReportTag: ", ReportTag);
			ipcRenderer.send("report-Notification", report);
		});
		Div.addEventListener("contextmenu", () => {
			if (replay != 0) return;

			let list = [];

			const reportD = TREM.Report.cache.get(report.identifier);
			console.log(reportD);

			if (reportD.download) {
				const oldtime = new Date(report.originTime.replace(/-/g, "/")).getTime();
				ipcRenderer.send("testoldtime", oldtime);
			} else if (report.ID.length) {
				list = list.concat(report.ID);
				ipcRenderer.send("testEEW", list);
			} else if (report.trem.length) {
				list = list.concat(report.trem);
				ipcRenderer.send("testEEW", list);
			} else {
				const oldtime = new Date(report.originTime.replace(/-/g, "/")).getTime();
				ipcRenderer.send("testoldtimeEEW", oldtime);
			}
		});

		if (prepend) {
			const locating = document.querySelector(".report-detail-container.locating");

			if (locating) {
				locating.replaceWith(Div.children[0]);
			} else {
				if (investigation) {
					investigation = false;
					roll.removeChild(roll.children[0]);
				}

				roll.prepend(Div);
			}

			if (Report != 0) Report = 0;

			TREM.Report.cache.set(report.identifier, report);

			if (report.identifier.startsWith("CWB") && setting["report.onlycwbchangeView"]) {
				TREM.Report.setView("eq-report-overview", report);
				changeView("report", "#reportView_btn");
				ReportTag = NOW().getTime();
				console.log("ReportTag: ", ReportTag);
			} else if (setting["report.changeView"]) {
				TREM.Report.setView("eq-report-overview", report);
				changeView("report", "#reportView_btn");
				ReportTag = NOW().getTime();
				console.log("ReportTag: ", ReportTag);
			}
		} else {
			roll.append(Div);
		}
	}
}

// #endregion

// #region 設定
function openSettingWindow() {
	// document.getElementById("setting_btn").classList.add("hide");
	win.setAlwaysOnTop(false);
	ipcRenderer.send("openChildWindow");
	toggleNav(false);
}

// #region RTS
function openRTSWindow() {
	win.setAlwaysOnTop(false);
	ipcRenderer.send("openRTSWindow");
	toggleNav(false);
}

// #region RTS
function openIntensityWindow() {
	win.setAlwaysOnTop(false);
	ipcRenderer.send("openIntensityWindow");
	toggleNav(false);
}
// ipcMain.on("setting_btn_remove_hide", () => {
// 	document.getElementById("setting_btn").classList.remove("hide");
// });
// #endregion

// #region Number >> Intensity
function IntensityI(Intensity) {
	return Intensity == 5 ? "5-"
		: Intensity == 6 ? "5+"
			: Intensity == 7 ? "6-"
				: Intensity == 8 ? "6+"
					: Intensity == 9 ? "7"
						: Intensity ?? "--";
}
// #endregion

// #region Intensity >> Number
function IntensityN(level) {
	return level == "5-" ? 5
		: level == "5+" ? 6
			: level == "6-" ? 7
				: level == "6+" ? 8
					: level == "7" ? 9
						: Number(level);
}
// #endregion

// #region Intensity >> Class String
function IntensityToClassString(level) {
	let classname = (level == 9) ? "seven"
		: (level == 8) ? "six strong"
			: (level == 7) ? "six"
				: (level == 6) ? "five strong"
					: (level == 5) ? "five"
						: (level == 4) ? "four"
							: (level == 3) ? "three"
								: (level == 2) ? "two"
									: (level == 1) ? "one"
										: (level == "na") ? "na"
											: "zero";

	if (tinycolor(setting["theme.customColor"] ? setting[`theme.int.${level}`] : [
		"#757575",
		"#757575",
		"#2774C2",
		"#7BA822",
		"#E8D630",
		"#E68439",
		"#DB641F",
		"#F55647",
		"#DB1F1F",
		"#862DB3",
	][level]).getLuminance() > 0.575)
		classname += " darkText";

	return classname;
}
// #endregion

// #region color
TREM.color = function color(Intensity) {
	return setting["theme.customColor"] ? setting[`theme.int.${Intensity}`]
		: [
			"#757575",
			"#757575",
			"#2774C2",
			"#7BA822",
			"#E8D630",
			"#E68439",
			"#DB641F",
			"#F55647",
			"#DB1F1F",
			"#862DB3",
		][Intensity];
	// return ["#666666", "#0165CC", "#01BB02", "#EBC000", "#FF8400", "#E06300", "#FF0000", "#B50000", "#68009E"][Intensity ? Intensity - 1 : Intensity];
};
// #endregion

// #region IPC
ipcMain.once("start", () => {
	try {
		if (localStorage.TOS_v1_1 == undefined)
			showDialog(
				"warn",
				"TOS 服務條款 1.1",
				"• 使用本服務應視為用戶同意使用條款\n• TREM 是一款提供 地震檢知、地震預警、海嘯警報、震度速報、地震報告 的軟體\n• 禁止在未經允許的情況下二次分發 TREM 軟體內的任何資訊\n• 禁止轉售 TREM 提供之資訊\n• 禁止違反法律法規或違反公共秩序和道德的行為\n• 除以上條款外 任何開發團隊合理認為不適當的行為均不被允許\n• TREM 使用 P2P 技術傳遞資訊\n• 任何資訊均以 中央氣象局(CWB) 發布之內容為準\n• Powered by ExpTech | 2023/05/03",
				0,
				"warning",
				() => {
					localStorage.TOS_v1_1 = true;
				},
				"我已詳細閱讀 並同意上述條款",
				"",
				() => void 0,
				0,
				1);

		if (localStorage.rts_alert_false == undefined) {
			localStorage.rts_alert_false = true;
			ipcRenderer.send("config:value", "Real-time.alert", false);
		}

		setInterval(() => {
			if (DATAstamp != 0 && Stamp != DATAstamp) {
				Stamp = DATAstamp;
				FCMdata(DATA, ServerType);
			}
		}, 0);
		log(`Initializing ServerCore >> ${ServerVer}`, 1, "Initialization", "start");
		dump({ level: 0, message: `Initializing ServerCore >> ${ServerVer}`, origin: "Initialization" });
	} catch (error) {
		showDialog("error", "發生錯誤", `初始化過程中發生錯誤，您可以繼續使用此應用程式，但無法保證所有功能皆能繼續正常運作。\n\n如果這是您第一次看到這個訊息，請嘗試重新啟動應用程式。\n如果這個錯誤持續出現，請到 TREM Discord 伺服器回報問題。\n\n錯誤訊息：${error}`);
		$("#load").delay(1000).fadeOut(1000);
		log(error, 3, "Initialization", "start");
		dump({ level: 2, message: error, origin: "Initialization" });
	}
});

const stopReplay = function() {
	if (Object.keys(EarthquakeList).length != 0) Cancel = true;

	if (Object.keys(detected_list).length != 0) PGACancel = true;

	if (replay != 0) {
		replay = 0;
		Report = 0;
		ipcMain.emit("ReportGET");
	}

	if (TREM.MapIntensity.isTriggered)
		TREM.MapIntensity.clear();

	if (TREM.MapArea2.isTriggered)
		TREM.MapArea2.clear();

	if (replayD) replayD = false;

	WarnAudio = Date.now() + 3000;

	// if (setting["p2p.mode"])
	// 	try {
	// 		if (service_status.websocket.status)
	// 			axios.post(posturl + "stop", { uuid: localStorage.UUID_p2p }).catch((error) => dump({ level: 2, message: error, origin: "Verbose" }));
	// 	} catch (e) {
	// 		dump({ level: 2, message: e, origin: "Verbose" });
	// 	}

	axios.post(posturl + "stop", { uuid: localStorage.UUID })
	// Exptech.v1.post("/trem/stop", { uuid: localStorage.UUID })
		.catch((error) => {
			log(error, 3, "Verbose", "stopReplay");
			dump({ level: 2, message: error, origin: "Verbose" });
		});

	Mapsmainfocus();
	testEEWerror = false;
	unstopReplaybtn();
	globalgc();
};

function unstopReplaybtn() {
	document.getElementById("togglenav_btn").classList.remove("hide");
	document.getElementById("stopReplay").classList.add("hide");
}

function stopReplaybtn() {
	changeView("main", "#mainView_btn");
	document.getElementById("togglenav_btn").classList.add("hide");
	document.getElementById("stopReplay").classList.remove("hide");
}

TREM.backindexButton = () => {
	TREM.set_report_overview = 0;
	ReportTag = 0;
	changeView("main", "#mainView_btn");
};

ipcMain.on("testoldtimeEEW", (event, oldtime) => {
	replay = oldtime - 25000;
	replayT = NOW().getTime();
	ipcMain.emit("ReportGET");
	stopReplaybtn();
});

ipcMain.on("testoldtime", (event, oldtime) => {
	replayD = true;
	replay = oldtime - 25000;
	replayTemp = replay;
	replayT = NOW().getTime();
	ipcMain.emit("ReportGET");
	stopReplaybtn();
	PGAMain();
});

ipcMain.on("sleep", (event, mode) => {
	if (mode)
		sleep(mode);
	else
		sleep(mode);
});

ipcMain.on("apikey", (event) => {
	apikey();
});

ipcMain.on("report-Notification", (event, report) => {
	if (setting["webhook.url"] != "" && setting["report.Notification"]) {
		console.log(report);
		log("Posting Notification report Webhook", 1, "Webhook", "report-Notification");
		dump({ level: 0, message: "Posting Notification report Webhook", origin: "Webhook" });
		const msg = {
			username   : "TREM | 臺灣即時地震監測",
			avatar_url : "https://raw.githubusercontent.com/ExpTechTW/API/%E4%B8%BB%E8%A6%81%E7%9A%84-(main)/image/Icon/ExpTech.png",
			content    : setting["tts.Notification"] ? ("地震報告"
			+ ((report.data.length != 0) ? "發生規模" + report.magnitudeValue + "有感地震，最大震度" + report.data[0].areaName + report.data[0].eqStation[0].stationName + IntensityI(report.data[0].areaIntensity) + "級。" : "發生規模" + report.magnitudeValue + "有感地震 ")
			+ "編號"
			+ (report.location.startsWith("地震資訊") ? "無（地震資訊）" : report.earthquakeNo % 1000 ? report.earthquakeNo : "無（小區域有感地震）")
			+ "時間"
			+ report.originTime
			+ "深度"
			+ report.depth + " 公里"
			+ "震央位置"
			+ "經度 東經 " + report.epicenterLon + "緯度 北緯 " + report.epicenterLat + "即在" + report.location
			+ ((report.data.length != 0) ? "最大震度" + IntensityI(report.data[0].areaIntensity) + "級地區" : "")
			+ ((report.data.length != 0) ? report.data[0].areaName : "")) : "地震報告",
			tts    : setting["tts.Notification"],
			embeds : [
				{
					author: {
						name     : "地震報告",
						url      : undefined,
						icon_url : undefined,
					},
					description : (report.data.length != 0) ? "發生規模" + report.magnitudeValue + "有感地震，最大震度" + report.data[0].areaName + report.data[0].eqStation[0].stationName + IntensityI(report.data[0].areaIntensity) + "級。" : "發生規模" + report.magnitudeValue + "有感地震",
					fields      : [
						{
							name   : "編號",
							value  : report.location.startsWith("地震資訊") ? "無（地震資訊）" : report.earthquakeNo % 1000 ? report.earthquakeNo : "無（小區域有感地震）",
							inline : true,
						},
						{
							name   : "時間",
							value  : report.originTime,
							inline : true,
						},
						{
							name   : "深度",
							value  : report.depth + " 公里",
							inline : true,
						},
						{
							name   : "震央位置",
							value  : "> 經度 **東經 " + report.epicenterLon + "**\n> 緯度 **北緯 " + report.epicenterLat + "**\n> 即在 **" + report.location + "**",
							inline : false,
						},
						{
							name   : (report.data.length != 0) ? "最大震度" + IntensityI(report.data[0].areaIntensity) + "級地區" : "",
							value  : (report.data.length != 0) ? report.data[0].areaName : "",
							inline : false,
						},
					],
					color: report.location.startsWith("地震資訊") ? 9807270 : report.earthquakeNo % 1000 ? 15158332 : 3066993,
				},
			],
		};
		fetch(setting["webhook.url"], {
			method  : "POST",
			headers : { "Content-Type": "application/json" },
			body    : JSON.stringify(msg),
		}).catch((error) => {
			log(error, 3, "Webhook", "report-Notification");
			dump({ level: 2, message: error, origin: "Webhook" });
		});
	}

	const location = report.location.match(/(?<=位於).+(?=\))/);

	if (report.data.length != 0 && speecd_use) {
		const areaIntensity = `${IntensityI(report.data[0].areaIntensity)}級`;
		TREM.speech.speak({ text: `${location}發生規模 ${report.magnitudeValue.toFixed(1).replace(".", "點")}，最大震度${report.data[0].areaName + report.data[0].eqStation[0].stationName + areaIntensity.replace("-級", "弱").replace("+級", "強")}` });
	} else if (speecd_use) {
		TREM.speech.speak({ text: `${location}發生規模 ${report.magnitudeValue.toFixed(1).replace(".", "點")}` });
	}
});

ipcMain.on("intensity-Notification", (event, intensity) => {
	// console.log(intensity);
	const info = intensity.raw.info;
	const intensity1 = intensity.raw.intensity;
	let description = "";
	let city0 = "";
	const intensity1r = {};
	const intensity1rkeys = Object.keys(intensity1).reverse();

	for (let index = 0; index < intensity1rkeys.length; index++) {
		const intensity2 = Number(Object.keys(intensity1)[(intensity1rkeys.length - (1 + index))]);
		const ids = intensity1[intensity1rkeys[index]];
		const intensity3 = `${IntensityI(intensity2)}級`;

		description += `${intensity3.replace("-級", "弱").replace("+級", "強")}\n`;

		for (const city in TREM.Resources.region)
			for (const town in TREM.Resources.region[city]) {
				const loc = TREM.Resources.region[city][town];

				for (const id of ids)
					if (loc.id == id && city0 == city) {
						description += ` ${town}`;
					} else if (loc.id == id && city0 == "") {
						description += `${city} ${town}`;
						city0 = city;
					} else if (loc.id == id && city0 != city) {
						description += `\n${city} ${town}`;
						city0 = city;
					}
			}

		city0 = "";
		description += "\n";
	}

	description += "\n";

	if (setting["webhook.url"] != "" && setting["intensity.Notification"]) {
		log("Posting Notification intensity Webhook", 1, "Webhook", "intensity-Notification");
		dump({ level: 0, message: "Posting Notification intensity Webhook", origin: "Webhook" });
		const msg = {
			username   : "TREM | 臺灣即時地震監測",
			avatar_url : "https://raw.githubusercontent.com/ExpTechTW/API/%E4%B8%BB%E8%A6%81%E7%9A%84-(main)/image/Icon/ExpTech.png",
			content    : setting["tts.Notification"] ? ("震度速報"
			+ "資料來源" + intensity.unit
			+ (info.time != 0 ? "發震時間" : "接收時間") + new Date(info.time != 0 ? info.time : intensity.timestamp).toLocaleString(undefined, { dateStyle: "long", timeStyle: "medium", hour12: false, timeZone: "Asia/Taipei" })
			+ "芮氏規模" + (info.scale != 0 ? info.scale : "未知")
			+ "深度" + (info.depth != 0 ? info.depth + " 公里" : "未知")
			+ "震央位置" + "東經" + (info.lon != 0 ? info.lon : "未知") + "北緯" + (info.lat != 0 ? info.lat : "未知")) : "震度速報",
			tts    : setting["tts.Notification"],
			embeds : [
				{
					author: {
						name     : "震度速報",
						url      : undefined,
						icon_url : undefined,
					},
					fields: [
						{
							name   : "資料來源",
							value  : intensity.unit,
							inline : true,
						},
						{
							name   : info.time != 0 ? "發震時間" : "接收時間",
							value  : new Date(info.time != 0 ? info.time : intensity.timestamp).toLocaleString(undefined, { dateStyle: "long", timeStyle: "medium", hour12: false, timeZone: "Asia/Taipei" }),
							inline : true,
						},
						{
							name   : "芮氏規模",
							value  : info.scale != 0 ? info.scale : "未知",
							inline : true,
						},
						{
							name   : "深度",
							value  : info.depth != 0 ? info.depth + " 公里" : "未知",
							inline : true,
						},
						{
							name   : "震央位置",
							value  : "> 經度 **東經 " + (info.lon != 0 ? info.lon : "未知") + "**\n> 緯度 **北緯 " + (info.lat != 0 ? info.lat : "未知") + "**",
							inline : false,
						},
						{
							name   : "震度分布",
							value  : description,
							inline : true,
						},
					],
				},
			],
		};
		fetch(setting["webhook.url"], {
			method  : "POST",
			headers : { "Content-Type": "application/json" },
			body    : JSON.stringify(msg),
		}).catch((error) => {
			log(error, 3, "Webhook", "intensity-Notification");
			dump({ level: 2, message: error, origin: "Webhook" });
		});
	}

	if (speecd_use && intensity.unit != "palert") {
		const now = timeconvert(new Date(info.time != 0 ? info.time : intensity.timestamp)).format("YYYY/MM/DD HH:mm:ss");
		let description0 = "";

		for (let index = 0, keys = Object.keys(intensity1r), n = keys.length; index < n; index++) {
			const intensity2 = keys.length - Number(keys[index]);
			const ids = intensity1r[Number(keys[index])];
			const intensity3 = `${IntensityI(intensity2)}級`;

			for (const city in TREM.Resources.region)
				for (const town in TREM.Resources.region[city]) {
					const loc = TREM.Resources.region[city][town];

					for (const id of ids)
						if (loc.id == id && city0 == city) {
							continue;
						} else if (loc.id == id && city0 == "") {
							description0 += `${city}`;
							description0 += `${intensity3.replace("-級", "弱").replace("+級", "強")}\n`;
							city0 = city;
						} else if (loc.id == id && city0 != city) {
							description0 += `\n${city}`;
							description0 += `${intensity3.replace("-級", "弱").replace("+級", "強")}\n`;
							city0 = city;
						}
				}

			city0 = "";
		}

		TREM.speech.speak({ text: "震度速報"
		+ "資料來源" + intensity.unit
		+ (info.time != 0 ? "發震時間" : "接收時間") + now
		+ "震度分布" + description0 });
	}
});

ipcMain.on("update-available-Notification", (version, getVersion, info) => {
	if (setting["webhook.url"] != undefined)
		if (setting["webhook.url"] != "" && setting["checkForUpdates.Notification"]) {
			log("Posting Notification Update Webhook", 1, "Webhook", "update-available-Notification");
			dump({ level: 0, message: "Posting Notification Update Webhook", origin: "Webhook" });
			const getVersionbody = TREM.Localization.getString("Notification_Update_Body").format(getVersion, version) + `\nhttps://github.com/yayacat/TREM/releases/tag/v${version}`;
			const msg = {
				username   : "TREM | 臺灣即時地震監測",
				avatar_url : "https://raw.githubusercontent.com/ExpTechTW/API/%E4%B8%BB%E8%A6%81%E7%9A%84-(main)/image/Icon/ExpTech.png",
				embeds     : [
					{
						author      : { name: "TREM | 臺灣即時地震監測" },
						title       : "",
						description : "",
						color       : 4629503,
					},
				] };
			msg.embeds[0].title = TREM.Localization.getString("Notification_Update_Title");
			msg.embeds[0].description = getVersionbody;
			fetch(setting["webhook.url"], {
				method  : "POST",
				headers : { "Content-Type": "application/json" },
				body    : JSON.stringify(msg),
			}).catch((error) => {
				log(error, 3, "Webhook", "update-available-Notification");
				dump({ level: 2, message: error, origin: "Webhook" });
			});
		}

	showDialog("success", `有可用的${info.releaseName}版本更新`, info.releaseNotes.replace("<p>", "").replaceAll("<br>", "").replace("</p>", ""),
		1, "update", () => {
			shell.openExternal(`https://github.com/yayacat/TREM/releases/tag/v${version}`);
		}, "前往更新", "暫緩更新", () => void 0, 60);
});

ipcMain.on("update-not-available-Notification", (version, getVersion) => {
	if (setting["webhook.url"] != undefined)
		if (setting["webhook.url"] != "" && setting["checkForUpdates.Notification"]) {
			log("Posting Notification No Update Webhook", 1, "Webhook", "update-not-available-Notification");
			dump({ level: 0, message: "Posting Notification No Update Webhook", origin: "Webhook" });
			const getVersionbody = TREM.Localization.getString("Notification_No_Update_Body").format(getVersion, version);
			const msg = {
				username   : "TREM | 臺灣即時地震監測",
				avatar_url : "https://raw.githubusercontent.com/ExpTechTW/API/%E4%B8%BB%E8%A6%81%E7%9A%84-(main)/image/Icon/ExpTech.png",
				embeds     : [
					{
						author      : { name: "TREM | 臺灣即時地震監測" },
						title       : "",
						description : "",
						color       : 4629503,
					},
				] };
			msg.embeds[0].title = TREM.Localization.getString("Notification_No_Update_Title");
			msg.embeds[0].description = getVersionbody;
			fetch(setting["webhook.url"], {
				method  : "POST",
				headers : { "Content-Type": "application/json" },
				body    : JSON.stringify(msg),
			}).catch((error) => {
				log(error, 3, "Webhook", "update-not-available-Notification");
				dump({ level: 2, message: error, origin: "Webhook" });
			});
		}
});

ipcMain.on("testEEW", (event, list = []) => {
	toggleNav(false);
	stopReplaybtn();
	replaytestEEW = NOW().getTime();

	if (TREM.MapIntensity.isTriggered)
		TREM.MapIntensity.clear();

	if (TREM.MapArea2.isTriggered)
		TREM.MapArea2.clear();

	if (!list.length)
		setTimeout(() => {
			log("Start EEW Test", 1, "EEW", "testEEW");
			dump({ level: 0, message: "Start EEW Test", origin: "EEW" });
			let data = {};

			// if (setting["p2p.mode"])
			// 	try {
			// 		if (service_status.websocket.status) {
			// 			data = {
			// 				uuid: localStorage.UUID_p2p,
			// 			};
			// 			dump({ level: 3, message: `Timer status: ${TimerDesynced ? "Desynced" : "Synced"}`, origin: "Verbose" });
			// 			axios.post(posturl + "replay", data)
			// 				.then(() => {
			// 					testEEWerror = false;
			// 				})
			// 				.catch((error) => {
			// 					testEEWerror = true;
			// 					dump({ level: 2, message: error, origin: "Verbose" });
			// 				});
			// 		}
			// 	} catch (e) {
			// 		data = {};
			// 	}

			data = {
				uuid: localStorage.UUID,
			};
			log(`Timer status: ${TimerDesynced ? "Desynced" : "Synced"}`, 0, "Verbose", "testEEW");
			dump({ level: 3, message: `Timer status: ${TimerDesynced ? "Desynced" : "Synced"}`, origin: "Verbose" });
			axios.post(posturl + "replay", data)
			// Exptech.v1.post("/trem/replay", data)
				.then(() => {
					testEEWerror = false;
				})
				.catch((error) => {
					testEEWerror = true;
					log(error, 3, "Verbose", "testEEW");
					dump({ level: 2, message: error, origin: "Verbose" });
				});
		}, 100);
	else
		for (let index = 0; index < list.length; index++)
			setTimeout(() => {
				log("Start list EEW Test", 1, "EEW", "testEEW");
				dump({ level: 0, message: "Start list EEW Test", origin: "EEW" });
				let data = {};

				// if (setting["p2p.mode"])
				// 	try {
				// 		if (service_status.websocket.status) {
				// 			data = {
				// 				uuid : localStorage.UUID_p2p,
				// 				id   : list[index],
				// 			};
				// 			dump({ level: 3, message: `Timer status: ${TimerDesynced ? "Desynced" : "Synced"}`, origin: "Verbose" });
				// 			axios.post(posturl + "replay", data)
				// 				.then(() => {
				// 					testEEWerror = false;
				// 				})
				// 				.catch((error) => {
				// 					testEEWerror = true;
				// 					dump({ level: 2, message: error, origin: "Verbose" });
				// 				});
				// 		}
				// 	} catch (e) {
				// 		data = {};
				// 	}

				data = {
					uuid : localStorage.UUID,
					id   : list[index],
				};
				log(`Timer status: ${TimerDesynced ? "Desynced" : "Synced"}`, 0, "Verbose", "testEEW");
				dump({ level: 3, message: `Timer status: ${TimerDesynced ? "Desynced" : "Synced"}`, origin: "Verbose" });
				axios.post(posturl + "replay", data)
				// Exptech.v1.post("/trem/replay", data)
					.then(() => {
						testEEWerror = false;
					})
					.catch((error) => {
						testEEWerror = true;
						log(error, 3, "Verbose", "testEEW");
						dump({ level: 2, message: error, origin: "Verbose" });
					});
			}, 100);
});

ipcRenderer.on("settingError", (event, error) => {
	is_setting_disabled = error;
});

const updateMapColors = async (event, value) => {
	let accent, dark;

	if (typeof value == "boolean") {
		accent = setting["theme.color"];
		dark = value;
	} else {
		accent = value;
		dark = setting["theme.dark"];
	}

	TREM.Colors = await getThemeColors(accent, dark);

	if (TREM.Detector.webgl || TREM.MapRenderingEngine == "mapbox-gl") {
		for (const mapName in MapBases)
			for (const [key, layer] of MapBases[mapName])
				if (Maps[mapName] instanceof maplibregl.Map)
					if (layer.type == "fill" && key != "tw_county_fill") {
						Maps[mapName].setPaintProperty(layer.id, "fill-color", TREM.Colors.surfaceVariant);
						Maps[mapName].setPaintProperty(layer.id, "fill-outline-color", TREM.Colors.secondary);
					} else if (layer.type == "fill" && key == "tw_county_fill") {
						Maps[mapName].setPaintProperty(layer.id, "fill-color", TREM.Colors.surfaceVariant);
					} else if (layer.type == "line" && key == "tw_county_line") {
						Maps[mapName].setPaintProperty(layer.id, "line-color", TREM.Colors.primary);
					}

		Maps.main.setPaintProperty("Layer_intensity_palert", "fill-outline-color", [
			"case",
			[
				">",
				[
					"coalesce",
					["feature-state", "intensity"],
					0,
				],
				0,
			],
			TREM.Colors.onSurfaceVariant,
			"transparent",
		]);
	}
};

ipcRenderer.on("config:theme", updateMapColors);
ipcRenderer.on("config:dark", updateMapColors);
ipcRenderer.on("config:color", (event, key, value) => {
	if (typeof event == "boolean") key = event;

	if (typeof key == "boolean") {
		for (let i = 0; i < 10; i++) {
			document.body.style[key ? "setProperty" : "removeProperty"](`--custom-int-${i}`, setting[`theme.int.${i}`]);

			if (tinycolor(key ? setting[`theme.int.${i}`] : [
				"#757575",
				"#757575",
				"#2774C2",
				"#7BA822",
				"#E8D630",
				"#E68439",
				"#DB641F",
				"#F55647",
				"#DB1F1F",
				"#862DB3",
			][i]).getLuminance() > 0.575)
				$(`.${IntensityToClassString(i).replace(" darkText", "").split(" ").join(".")}`).addClass("darkText");
			else
				$(`.${IntensityToClassString(i).replace(" darkText", "").split(" ").join(".")}`).removeClass("darkText");
		}
	} else if (setting["theme.customColor"]) {
		document.body.style.setProperty(`--${key.replace(/\./g, "-").replace("theme", "custom")}`, value);

		if (tinycolor(value).getLuminance() > 0.575)
			$(`.${IntensityToClassString(IntensityN(key.replace("theme.int.", ""))).replace(" darkText", "").split(" ").join(".")}`).addClass("darkText");
		else
			$(`.${IntensityToClassString(IntensityN(key.replace("theme.int.", ""))).replace(" darkText", "").split(" ").join(".")}`).removeClass("darkText");
	}

	if (TREM.Detector.webgl || TREM.MapRenderingEngine == "mapbox-gl")
		if (Maps.main) {
			Maps.main.setPaintProperty("Layer_intensity_palert", "fill-color", [
				"match",
				[
					"coalesce",
					["feature-state", "intensity"],
					0,
				],
				9,
				setting["theme.customColor"] ? setting["theme.int.9"]
					: "#862DB3",
				8,
				setting["theme.customColor"] ? setting["theme.int.8"]
					: "#DB1F1F",
				7,
				setting["theme.customColor"] ? setting["theme.int.7"]
					: "#F55647",
				6,
				setting["theme.customColor"] ? setting["theme.int.6"]
					: "#DB641F",
				5,
				setting["theme.customColor"] ? setting["theme.int.5"]
					: "#E68439",
				4,
				setting["theme.customColor"] ? setting["theme.int.4"]
					: "#E8D630",
				3,
				setting["theme.customColor"] ? setting["theme.int.3"]
					: "#7BA822",
				2,
				setting["theme.customColor"] ? setting["theme.int.2"]
					: "#2774C2",
				1,
				setting["theme.customColor"] ? setting["theme.int.1"]
					: "#757575",
				"transparent",
			]);
			Maps.main.setPaintProperty("Layer_area", "line-color", [
				"match",
				[
					"coalesce",
					["feature-state", "intensity"],
					0,
				],
				9,
				setting["theme.customColor"] ? setting["theme.int.9"]
					: "#862DB3",
				8,
				setting["theme.customColor"] ? setting["theme.int.8"]
					: "#DB1F1F",
				7,
				setting["theme.customColor"] ? setting["theme.int.7"]
					: "#F55647",
				6,
				setting["theme.customColor"] ? setting["theme.int.6"]
					: "#DB641F",
				5,
				setting["theme.customColor"] ? setting["theme.int.5"]
					: "#E68439",
				4,
				setting["theme.customColor"] ? setting["theme.int.4"]
					: "#E8D630",
				3,
				setting["theme.customColor"] ? setting["theme.int.3"]
					: "#7BA822",
				2,
				setting["theme.customColor"] ? setting["theme.int.2"]
					: "#2774C2",
				1,
				setting["theme.customColor"] ? setting["theme.int.1"]
					: "#757575",
				"transparent",
			]);
		}
});
ipcRenderer.on("config:location", (event, value) => {
	setUserLocationMarker(value);
});
ipcRenderer.on("config:mapanimation", (event, value) => {
	Maps.main._fadeAnimated = value;
	Maps.main._zoomAnimated = value;
	Maps.report._fadeAnimated = value;
	Maps.report._zoomAnimated = value;
});
ipcRenderer.on("config:maplayer", (event, mapName, state) => {
	Maps.main.setLayoutProperty(`Layer_${mapName}`, "visibility", state ? "visible" : "none");
});
// #endregion

// #region EEW
function FCMdata(json, Unit) {
	// const json = JSON.parse(JSON.stringify(data));
	// const json = JSON.parse(data);
	// console.log(json);

	if (server_timestamp.includes(json.timestamp) || NOW().getTime() - json.timestamp > 180_000) return;
	server_timestamp.push(json.timestamp);

	if (server_timestamp.length > 15) server_timestamp.splice(0, 1);
	// eslint-disable-next-line no-empty-function
	fs.writeFile(path.join(app.getPath("userData"), "server.json"), JSON.stringify(server_timestamp), () => {});
	// GetData = true;
	const filename = NOW().getTime();

	if (json.response != "You have successfully subscribed to earthquake information") {
		json.data_unit = Unit;
		json.delay = NOW().getTime() - json.timestamp;
		fs.writeFile(path.join(folder, `${filename}.tmp`), JSON.stringify(json), (err) => {
			fs.rename(path.join(folder, `${filename}.tmp`), path.join(folder, `${filename}.json`), () => void 0);
		});
	}

	type_Unit = Unit;
	log(`Latency: ${NOW().getTime() - json.timestamp}ms`, 1, "API", "FCMdata");
	dump({ level: 0, message: `Latency: ${NOW().getTime() - json.timestamp}ms`, origin: "API" });
	console.log(json);

	if (json.type == "tsunami-info") {
		const now = new Date(json.time);
		const Now0 = now.getFullYear()
			+ "/" + (now.getMonth() + 1)
			+ "/" + now.getDate()
			+ " " + now.getHours()
			+ ":" + now.getMinutes();
		log("Got Tsunami Warning", 1, "API", "FCMdata");
		dump({ level: 0, message: "Got Tsunami Warning", origin: "API" });
		new Notification("海嘯資訊", { body: `${Now0}\n${json.location} 發生 ${json.scale} 地震\n東經: ${json.lon} 度 北緯: ${json.lat} 度`, icon: "../TREM.ico" });

		if (speecd_use) TREM.speech.speak({ text: `海嘯資訊${Now0} ${json.location} 發生 ${json.scale.replace(".", "點")} 地震` });
	} else if (json.type == "tsunami") {
		TREM.Earthquake.emit("tsunami", json);
	} else if (json.type == "trem-eq") {
		TREM.Earthquake.emit("trem-eq", json);
	} else if (json.type == "palert") {
		TREM.MapIntensity.palert(json);
	} else if (json.type == "palert-app") {
		console.log(json);
	} else if (json.type == "pws") {
		TREM.PWS.addPWS(json.raw);
	} else if (json.type == "intensity") {
		log("Got Earthquake intensity", 1, "API", "FCMdata");
		dump({ level: 0, message: "Got Earthquake intensity", origin: "API" });

		setTimeout(() => {
			ipcRenderer.send("screenshotEEWI", {
				Function : "intensity",
				ID       : 1,
				Version  : 1,
				Time     : NOW().getTime(),
				Shot     : 1,
			});
		}, 1250);

		if (json.unit == "cwb")
			ipcRenderer.send("config:value", "intensity.cwb", filename.toString());
		else if (json.unit == "palert")
			ipcRenderer.send("config:value", "intensity.palert", filename.toString());
		else if (json.unit == "trem")
			ipcRenderer.send("config:value", "intensity.trem", filename.toString());

		ipcRenderer.send("TREMIntensityhandle", json);
		ipcRenderer.send("intensity-Notification", json);
	} else if (json.type == "replay") {
		log("Got Earthquake replay", 1, "API", "FCMdata");
		dump({ level: 0, message: "Got Earthquake replay", origin: "API" });

		if (!replayD) {
			replay = json.replay_timestamp;
			replayT = NOW().getTime();
		}

		ipcMain.emit("ReportGET");
		stopReplaybtn();
	} else if (json.type == "report") {
		if (TREM.MapIntensity.isTriggered)
			TREM.MapIntensity.clear();

		if (TREM.MapArea2.isTriggered)
			TREM.MapArea2.clear();

		if (setting["audio.report"]) audioPlay("../audio/Report.wav");
		log("Got Earthquake Report", 1, "API", "FCMdata");
		dump({ level: 0, message: "Got Earthquake Report", origin: "API" });

		if (setting["report.show"]) win.showInactive();

		if (setting["report.cover"])
			if (!win.isFullScreen()) {
				win.setAlwaysOnTop(true);
				win.focus();
				win.setAlwaysOnTop(false);
			}

		const report = json.raw;
		const location = json.location.match(/(?<=位於).+(?=\))/);

		if (report.identifier.startsWith("CWB") && setting["report.onlycwbchangeView"]) {
			if (!win.isFocused())
				new Notification("地震報告",
					{
						body   : `${location}發生規模 ${report.magnitudeValue.toFixed(1)} 有感地震，最大震度${report.data[0].areaName}${report.data[0].eqStation[0].stationName}${TREM.Constants.intensities[report.data[0].eqStation[0].stationIntensity].text}。`,
						icon   : "../TREM.ico",
						silent : win.isFocused(),
					});

			addReport(report, true);
			ipcRenderer.send("report-Notification", report);

			setTimeout(() => {
				ipcRenderer.send("screenshotEEW", {
					Function : "report",
					ID       : json.ID,
					Version  : 1,
					Time     : NOW().getTime(),
					Shot     : 1,
				});
			}, 5000);
		} else if (!setting["report.onlycwbchangeView"]) {
			if (report.location.startsWith("地震資訊") && api_key_verify) {
				if (!win.isFocused())
					new Notification("地震報告",
						{
							body   : `${location}發生規模 ${report.magnitudeValue.toFixed(1)} 有感地震，最大震度${report.data[0].areaName}${report.data[0].eqStation[0].stationName}${TREM.Constants.intensities[report.data[0].eqStation[0].stationIntensity].text}。`,
							icon   : "../TREM.ico",
							silent : win.isFocused(),
						});

				addReport(report, true);
				ipcRenderer.send("report-Notification", report);

				setTimeout(() => {
					ipcRenderer.send("screenshotEEW", {
						Function : "report",
						ID       : json.ID,
						Version  : 1,
						Time     : NOW().getTime(),
						Shot     : 1,
					});
				}, 5000);
			} else if (report.identifier.startsWith("CWB")) {
				if (!win.isFocused())
					new Notification("地震報告",
						{
							body   : `${location}發生規模 ${report.magnitudeValue.toFixed(1)} 有感地震，最大震度${report.data[0].areaName}${report.data[0].eqStation[0].stationName}${TREM.Constants.intensities[report.data[0].eqStation[0].stationIntensity].text}。`,
							icon   : "../TREM.ico",
							silent : win.isFocused(),
						});

				addReport(report, true);
				ipcRenderer.send("report-Notification", report);

				setTimeout(() => {
					ipcRenderer.send("screenshotEEW", {
						Function : "report",
						ID       : json.ID,
						Version  : 1,
						Time     : NOW().getTime(),
						Shot     : 1,
					});
				}, 5000);
			}
		}
	} else if (json.type.startsWith("eew") || json.type == "trem-eew") {
		if (replay != 0 && !json.replay_timestamp) return;

		if (json.type == "trem-eew" && !api_key_verify) return;

		// if (json.max < 3) return;

		if (
			(json.type == "eew-scdzj" && !setting["accept.eew.SCDZJ"])
			|| (json.type == "eew-nied" && !setting["accept.eew.NIED"])
			|| (json.type == "eew-jma" && !setting["accept.eew.JMA"])
			|| (json.type == "eew-kma" && !setting["accept.eew.KMA"])
			|| (json.type == "eew-cwb" && !setting["accept.eew.CWB"])
			|| (json.type == "eew-fjdzj" && !setting["accept.eew.FJDZJ"])
			|| (json.type == "trem-eew" && !setting["accept.eew.trem"])
		) return;

		json.Unit = (json.scale == 1) ? "PLUM(局部無阻尼運動傳播法)"
			: (json.type == "eew-scdzj") ? "四川省地震局 (SCDZJ)"
				: (json.type == "eew-nied") ? "防災科学技術研究所 (NIED)"
					: (json.type == "eew-kma") ? "기상청(KMA)"
						: (json.type == "eew-jma") ? "気象庁(JMA)"
							: (json.type == "eew-cwb") ? "中央氣象局 (CWB)"
								: (json.type == "eew-fjdzj") ? "福建省地震局 (FJDZJ)"
									: (json.type == "trem-eew" && json.number > 3) ? "TREM(實驗功能僅供參考)"
										: (json.type == "trem-eew" && json.number <= 3) ? "NSSPE(無震源參數推算)"
											: (json.Unit) ? json.Unit : "";

		stopReplaybtn();
		TREM.Earthquake.emit("eew", json);
	}
}
// #endregion

// #region Event: eew
TREM.Earthquake.on("eew", (data) => {
	log("Got EEW", 1, "API", "eew");
	dump({ level: 0, message: "Got EEW", origin: "API" });
	console.log(data);
	let Timer_run;

	if (data.type == "trem-eew" && data.lat == null || data.lon == null) return;

	if (!TREM.EEW.has(data.id))
		TREM.EEW.set(data.id, new EEW(data));
	else
		TREM.EEW.get(data.id).update(data);

	// handler
	if (!EarthquakeList[data.id]) EarthquakeList[data.id] = {
		epicenter       : [],
		Time            : 0,
		ID              : "",
		number          : "",
		Timer           : Timer_run,
		distance        : [],
		epicenterIcon   : null,
		epicenterIconTW : null,
	};

	EarthquakeList[data.id].epicenter = [+data.lon, +data.lat];
	EarthquakeList[data.id].Time = data.time;
	EarthquakeList[data.id].ID = data.id;

	let value = 0;
	let distance = 0;

	const GC = {};
	let level;
	let MaxIntensity = { label: "", value: -1 };
	const NSSPE = data.intensity ?? {};

	for (const city in TREM.Resources.region)
		for (const town in TREM.Resources.region[city]) {
			const loc = TREM.Resources.region[city][town];
			const d = TREM.Utils.twoSideDistance(
				TREM.Utils.twoPointDistance(
					{ lat: loc.latitude, lon: loc.longitude },
					{ lat: data.lat, lon: data.lon },
				),
				data.depth,
			);
			let int = TREM.Utils.PGAToIntensity(
				TREM.Utils.pga(
					data.scale,
					d,
					setting["earthquake.siteEffect"] ? loc.siteEffect : undefined,
				),
			);

			if (data.depth == null) int = NSSPE[loc[0]] ?? { value: 0, label: "0", get text() {
				return TREM.Localization.getString("Intensity_Zero");
			} };

			if (setting["location.city"] == city && setting["location.town"] == town) {
				level = int;
				distance = d;
				value = Math.floor(_speed(data.depth, distance).Stime - (NOW().getTime() - data.time) / 1000) - 2;
			}

			if (int.value > MaxIntensity.value)
				MaxIntensity = int;
			GC[loc.code] = int.value;
		}

	if (setting["location.lat"] != "" && setting["location.lon"] != "") {
		const d = TREM.Utils.twoSideDistance(
			TREM.Utils.twoPointDistance(
				{ lat: setting["location.lat"], lon: setting["location.lon"] },
				{ lat: data.lat, lon: data.lon },
			),
			data.depth,
		);
		let int = TREM.Utils.PGAToIntensity(
			TREM.Utils.pga(
				data.scale,
				d,
				undefined,
			),
		);

		for (const city in TREM.Resources.region)
			for (const town in TREM.Resources.region[city]) {
				const loc = TREM.Resources.region[city][town];

				if (data.depth == null) int = NSSPE[loc[0]] ?? { value: 0, label: "0", get text() {
					return TREM.Localization.getString("Intensity_Zero");
				} };
			}

		level = int;
		distance = d;
		value = Math.floor(_speed(data.depth, distance).Stime - (NOW().getTime() - data.time) / 1000) - 2;

		if (int.value > MaxIntensity.value)
			MaxIntensity = int;
	}

	if (setting["dev.mode"])
		if (data.type != "trem-eew" || data.type != "eew-cwb" || data.type != "eew-fjdzj") {
			const int = TREM.Utils.PGAToIntensity(
				TREM.Utils.pga(
					data.scale,
					10,
					1,
				),
			);

			if (int.value > MaxIntensity.value)
				MaxIntensity = int;
		}

	// TREM.MapIntensity.expected(GC);

	let Alert = true;

	if (level.value < Number(setting["eew.Intensity"])) Alert = false;

	let Nmsg = "";

	if (data.type == "trem-eew" && data.number <= 3) {
		data.scale = null;
		data.depth = null;
	}

	clearInterval(AudioT);
	audio.main_lock = false;
	AudioT = null;
	clearInterval(AudioT1);
	audio.minor_lock = false;
	AudioT1 = null;
	audio.main = [];
	audio.minor = [];

	if (value > 0)
		Nmsg = `${value}秒後抵達`;
	else
		Nmsg = "已抵達 (預警盲區)";

	const notify = (level.label.includes("+") || level.label.includes("-")) ? level.label.replace("+", "強").replace("-", "弱") : level.label + "級";
	let body = `${notify ?? "未知"}地震，${Nmsg}\nM ${data.scale} ${data.location ?? "未知區域"}`;

	if (data.depth == null) body = `${notify ?? "未知"}地震，${data.location ?? "未知區域"} (NSSPE)`;

	if (speecd_use && data.type != "trem-eew") {
		let speecd_scale = data.scale;
		const speecd_number = data.number;
		let find0 = INFO.findIndex(v => v.ID == data.id);

		if (!Number.isNaN(speecd_scale)) speecd_scale = Number.parseFloat(speecd_scale);

		if (find0 == -1) find0 = INFO.length;

		if (speecd_number == 1)
			TREM.speech.speak({ text: `${data.location}，發生規模${speecd_scale.toFixed(1).replace(".", "點")}地震` });
		else if (INFO[find0]?.alert_magnitude != speecd_scale && speecd_scale != 0)
			TREM.speech.speak({ text: `${data.location}，發生規模${speecd_scale.toFixed(1).replace(".", "點")}地震` });
		else if (INFO[find0]?.alert_magnitude != speecd_scale && speecd_scale == 0)
			TREM.speech.speak({ text: `${data.Unit}，已取消警報` });
		else if (data.cancel)
			TREM.speech.speak({ text: `${data.Unit}，已取消警報` });

		if (Number(speecd_scale) >= 7 && speecd_number == 1)
			TREM.speech.speak({ text: "震源位置及規模表明，可能發生海嘯，沿岸地區應慎防海水位突變，並留意中央氣象局是否發布，海嘯警報" });
		else if (Number(speecd_scale) >= 6 && speecd_number == 1)
			TREM.speech.speak({ text: "沿岸地區應慎防海水位突變" });
		else if (INFO[find0]?.alert_magnitude != speecd_scale)
			if (Number(speecd_scale) >= 7)
				TREM.speech.speak({ text: "震源位置及規模表明，可能發生海嘯，沿岸地區應慎防海水位突變，並留意中央氣象局是否發布，海嘯警報" });
			else if (Number(speecd_scale) >= 6)
				TREM.speech.speak({ text: "沿岸地區應慎防海水位突變" });

		if (data.type == "eew-cwb") audioPlay("../audio/cwbeew.wav");
	}

	new Notification("EEW 強震即時警報", {
		body   : body,
		icon   : "../TREM.ico",
		silent : win.isFocused(),
	});

	if (!Info.Notify.includes(data.id)) {
		Info.Notify.push(data.id);
		// show latest eew
		TINFO = INFO.length;
		clearInterval(Timers.ticker);
		Timers.ticker = setInterval(() => {
			if (TINFO + 1 >= INFO.length)
				TINFO = 0;
			else TINFO++;
		}, 5000);

		if (Alert) {
			changeView("main", "#mainView_btn");

			if (setting["eew.show"]) win.showInactive();

			if (setting["eew.cover"])
				if (!win.isFullScreen()) {
					win.setAlwaysOnTop(true);
					win.focus();
					win.setAlwaysOnTop(false);
				}

			if (!win.isFocused()) win.flashFrame(true);
		}

		eewt.id = data.id;

		if (data.type != "trem-eew")
			if (setting["audio.eew"] && Alert) {
				log("Playing Audio > eew", 1, "Audio", "eew");
				dump({ level: 0, message: "Playing Audio > eew", origin: "Audio" });
				TREM.Audios.eew.play();
				audioPlay1(`../audio/1/${level.label.replace("+", "").replace("-", "")}.wav`);

				if (level.label.includes("+"))
					audioPlay1("../audio/1/intensity-strong.wav");
				else if (level.label.includes("-"))
					audioPlay1("../audio/1/intensity-weak.wav");
				else
					audioPlay1("../audio/1/intensity.wav");

				if (value > 0 && value < 100) {
					if (value <= 10) {
						audioPlay1(`../audio/1/${value.toString()}.wav`);
					} else if (value < 20) {
						audioPlay1(`../audio/1/x${value.toString().substring(1, 2)}.wav`);
					} else {
						audioPlay1(`../audio/1/${value.toString().substring(0, 1)}x.wav`);
						audioPlay1(`../audio/1/x${value.toString().substring(1, 2)}.wav`);
					}

					audioPlay1("../audio/1/second.wav");
				}
			}
	}

	if (MaxIntensity.value >= 4 && data.number == 1) if (speecd_use) TREM.speech.speak({ text: "注意強震，此地震可能造成災害" });

	if (data.type != "trem-eew")
		if (MaxIntensity.value >= 5) {
			data.Alert = true;

			if (!Info.Warn.includes(data.id)) {
				Info.Warn.push(data.id);

				if (!EEWAlert) {
					EEWAlert = true;

					if (setting["audio.eew"] && Alert)
						for (let index = 0; index < 5; index++)
							audioPlay("../audio/Alert.wav");
				}
			}
		} else {
			data.Alert = false;
		}

	let _time = -1;
	let stamp = 0;

	if ((EarthquakeList[data.id].number ?? 1) < data.number) {
		if (data.type == "trem-eew" && setting["audio.eew"] && Alert) {
			log("Playing Audio > note", 1, "Audio", "eew");
			dump({ level: 0, message: "Playing Audio > note", origin: "Audio" });
			TREM.Audios.note.play();
		} else if (setting["audio.eew"] && Alert) {
			log("Playing Audio > update", 1, "Audio", "eew");
			dump({ level: 0, message: "Playing Audio > update", origin: "Audio" });
			TREM.Audios.update.play();
		}

		EarthquakeList[data.id].number = data.number;
	}

	eew[data.id] = {
		lon    : Number(data.lon),
		lat    : Number(data.lat),
		time   : 0,
		Time   : data.time,
		id     : data.id,
		km     : 0,
		type   : data.type,
		t      : eew[data.id]?.t ?? null,
		value  : Math.floor(_speed(data.depth, distance).Stime - (NOW().getTime() - data.time) / 1000),
		Second : eew[data.id]?.Second ?? -1,
		arrive : eew[data.id]?.arrive ?? "",
	};

	if (data.number != 1) {
		clearInterval(eew[data.id].t);
		eew[data.id].t = null;
		eew[data.id].Second = -1;
		eew[data.id].arrive = "";
	}

	if (data.type != "trem-eew")
		if (eew[data.id].Second == -1 || eew[data.id].value < eew[data.id].Second)
			if (setting["audio.eew"] && Alert)
				if (eew[data.id].arrive == "") {
					if (eew[data.id].t != null) {
						clearInterval(eew[data.id].t);
						eew[data.id].t = null;
					}

					eew[data.id].t = setInterval(() => {
						eew[data.id].value = Math.floor(_speed(data.depth, distance).Stime - (NOW().getTime() - data.time) / 1000);

						if (Math.sign(eew[data.id].value) != -1) {
							eew[data.id].Second = eew[data.id].value;

							if (stamp != eew[data.id].value && !audio.minor_lock) {
								stamp = eew[data.id].value;

								if (eew[data.id].value < 100)
									if (eew[data.id].value > 10) {
										if (eew[data.id].value.toString().substring(1, 2) == "0") {
											audioPlay1(`../audio/1/${eew[data.id].value.toString().substring(0, 1)}x.wav`);
											audioPlay1("../audio/1/x0.wav");
										} else {
											audioPlay("../audio/1/ding.wav");
										}
									} else if (eew[data.id].value > 0) {
										audioPlay1(`../audio/1/${eew[data.id].value.toString()}.wav`);
									} else {
										eew[data.id].arrive = data.id;
										audioPlay1("../audio/1/arrive.wav");
										_time = 0;
										eew[data.id].Second = -1;
									}
							}
						} else if (_time >= 0) {
							audioPlay("../audio/1/ding.wav");
							_time++;

							if (_time >= 10) {
								clearInterval(eew[data.id].t);
								eew[data.id].t = null;
								_time = -1;
							}
						}
					}, 50);
				}

	const speed = setting["shock.smoothing"] ? 100 : 500;

	if (EarthquakeList[data.id].Timer != undefined || EarthquakeList[data.id].Timer != null) clearInterval(EarthquakeList[data.id].Timer);

	if (EarthquakeList[data.id].epicenterIcon != undefined || EarthquakeList[data.id].epicenterIcon != null || EarthquakeList[data.id].epicenterIcon) {
		EarthquakeList[data.id].epicenterIcon.remove();
		EarthquakeList[data.id].epicenterIcon = null;
	}

	if (EarthquakeList.ITimer != undefined) clearInterval(EarthquakeList.ITimer);

	// AlertBox: 種類
	let classString = "alert-box ";

	if (data.replay_timestamp) {
		replay = data.replay_timestamp;
		replayT = NOW().getTime();
		stopReplaybtn();
	} else {
		replay = 0;
	}

	if (data.cancel)
		classString += "eew-cancel";
	else if (data.Test)
		classString += "eew-test";
	else if (data.Alert)
		classString += "eew-alert";
	else
		classString += "eew-pred";

	let find = INFO.findIndex(v => v.ID == data.id);

	if (find == -1) find = INFO.length;
	const time = new Date((data.replay_time) ? data.replay_time : data.time);
	INFO[find] = {
		ID              : data.id,
		alert_number    : data.number,
		alert_intensity : (data.type == "trem-eew") ? data.max ?? 0 : MaxIntensity.value,
		alert_location  : data.location ?? "未知區域",
		alert_time      : time,
		alert_sTime     : (data.type == "trem-eew") ? null : Math.floor(data.time + _speed(data.depth, distance).Stime * 1000),
		alert_pTime     : (data.type == "trem-eew") ? null : Math.floor(data.time + _speed(data.depth, distance).Ptime * 1000),
		alert_local     : (data.type == "trem-eew") ? "na" : level.value,
		alert_magnitude : data.scale ?? "?",
		alert_depth     : data.depth ?? "?",
		alert_provider  : (data.final) ? data.Unit + "(最終報)" : data.Unit,
		alert_type      : classString,
		"intensity-1"   : `<font color="white" size="7"><b>${MaxIntensity.label}</b></font>`,
		"time-1"        : `<font color="white" size="2"><b>${time}</b></font>`,
		"info-1"        : `<font color="white" size="4"><b>M ${data.scale} </b></font><font color="white" size="3"><b> 深度: ${data.depth} km</b></font>`,
		distance,
	};

	// switch to main view
	$("#mainView_btn")[0].click();
	// remember navrail state
	const navState = !$("#nav-rail").hasClass("hide");

	// hide navrail so the view goes fullscreen
	if (navState) toggleNav(false);
	// hide report to make screen clean
	$(roll).fadeOut(200);
	// show minimap
	$("#map-tw").addClass("show");

	updateText();

	if (Timers.eew == null)
		Timers.eew = setInterval(() => {
			updateText();

			if (Timers.ticker == null)
				Timers.ticker = setInterval(() => {
					if (TINFO + 1 >= INFO.length)
						TINFO = 0;
					else TINFO++;
				}, 5000);
		}, 1000);

	EEWshot = NOW().getTime() - 28500;
	EEWshotC = 1;
	const _distance = [];
	for (let index = 0; index < 1002; index++)
		_distance[index] = _speed(data.depth, index);
	EarthquakeList[data.id].distance = _distance;

	if (data.type == "trem-eew" && data.number <= 3) EarthquakeList[data.id].distance = null;

	main(data);

	if (EarthquakeList[data.id].Timer == undefined || EarthquakeList[data.id].Timer == null) EarthquakeList[data.id].Timer = Timer_run;

	EarthquakeList[data.id].Timer ??= setInterval(() => {
		main(data);
	}, speed);

	if (EarthquakeList[data.id].Timer != null || EarthquakeList[data.id].Timer != undefined) {
		clearInterval(EarthquakeList[data.id].Timer);
		EarthquakeList[data.id].Timer = setInterval(() => {
			main(data);
		}, speed);
	} else if (EarthquakeList[data.id].Timer == null || EarthquakeList[data.id].Timer == undefined) {
		EarthquakeList[data.id].Timer = setInterval(() => {
			main(data);
		}, speed);
	}

	if (TREM.EEW.get(data.id)?.geojson) {
		TREM.EEW.get(data.id).geojson.remove();
		delete TREM.EEW.get(data.id).geojson;
	}

	TREM.EEW.get(data.id).geojson = L.geoJson.vt(MapData.tw_town, {
		minZoom   : 7,
		maxZoom   : 7,
		tolerance : 20,
		buffer    : 256,
		debug     : 0,
		zIndex    : 1,
		style     : (properties) => {
			if (properties.TOWNCODE) {
				if (!GC[properties.TOWNCODE])
					return {
						stroke      : false,
						color       : "transparent",
						weight      : 0.8,
						opacity     : 0,
						fillColor   : TREM.Colors.surfaceVariant,
						fillOpacity : 0.6,
					};
				return {
					stroke      : false,
					color       : "transparent",
					weight      : 0.8,
					opacity     : 0,
					fillColor   : TREM.color(GC[properties.TOWNCODE]),
					fillOpacity : 1,
				};
			} else {
				return {
					color       : "transparent",
					weight      : 0.8,
					opacity     : 0,
					fillColor   : TREM.Colors.surfaceVariant,
					fillOpacity : 0.6,
				};
			}
		},
	});

	if (setting["webhook.url"] != "")
		setTimeout(() => {
			const showtime = timeconvert(time).format("YYYY/MM/DD HH:mm:ss");

			if (!setting["trem-eew.No-Notification"]) {
				const Now1 = NOW().getFullYear()
					+ "/" + (NOW().getMonth() + 1)
					+ "/" + NOW().getDate()
					+ " " + NOW().getHours()
					+ ":" + NOW().getMinutes()
					+ ":" + NOW().getSeconds();

				let msg = setting["webhook.body"];
				msg = msg.replace("%Depth%", data.depth == null ? "?" : data.depth).replace("%NorthLatitude%", data.lat).replace("%Time%", showtime).replace("%EastLongitude%", data.lon).replace("%location%", (data.type == "trem-eew" && data.number <= 3) ? "?" : data.location).replace("%Scale%", data.scale == null ? "?" : data.scale).replace("%Number%", data.number).replace("%Final%", (data.final) ? "(最終報)" : "");

				if (data.type == "eew-cwb")
					msg = msg.replace("%Provider%", "中央氣象局 (CWB)");
				else if (data.type == "eew-scdzj")
					msg = msg.replace("%Provider%", "四川省地震局 (SCDZJ)");
				else if (data.type == "eew-fjdzj")
					msg = msg.replace("%Provider%", "福建省地震局 (FJDZJ)");
				else if (data.type == "eew-nied")
					msg = msg.replace("%Provider%", "防災科学技術研究所 (NIED)");
				else if (data.type == "eew-jma")
					msg = msg.replace("%Provider%", "気象庁(JMA)");
				else if (data.type == "eew-kma")
					msg = msg.replace("%Provider%", "기상청(KMA)");
				else if (data.type == "trem-eew" && data.number <= 3)
					msg = msg.replace("%Provider%", "NSSPE(無震源參數推算)");
				else
					msg = msg.replace("%Provider%", data.Unit);

				msg = JSON.parse(msg);
				msg.username = "TREM | 臺灣即時地震監測";

				msg.embeds[0].image.url = "";
				msg.embeds[0].footer = {
					text     : `ExpTech Studio ${Now1}`,
					icon_url : "https://raw.githubusercontent.com/ExpTechTW/API/master/image/Icon/ExpTech.png",
				};
				msg.tts = setting["tts.Notification"];
				msg.content = setting["tts.Notification"] ? (showtime + "左右發生顯著有感地震東經" + data.lon + "北緯" + data.lat + "位於" + ((data.type == "trem-eew" && data.number <= 3) ? "?" : data.location) + "深度" + (data.depth == null ? "?" : data.depth + "公里") + "規模" + (data.scale == null ? "?" : data.scale) + "第" + data.number + "報發報單位" + data.Unit + "慎防強烈搖晃，就近避難 [趴下、掩護、穩住]") : "";
				log("Posting EEW Webhook", 1, "Webhook", "eew");
				dump({ level: 0, message: "Posting EEW Webhook", origin: "Webhook" });
				fetch(setting["webhook.url"], {
					method  : "POST",
					headers : { "Content-Type": "application/json" },
					body    : JSON.stringify(msg),
				}).catch((error) => {
					log(error, 3, "Webhook", "eew");
					dump({ level: 2, message: error, origin: "Webhook" });
				});
			} else if (setting["trem-eew.No-Notification"] && data.type != "trem-eew") {
				const Now1 = NOW().getFullYear()
					+ "/" + (NOW().getMonth() + 1)
					+ "/" + NOW().getDate()
					+ " " + NOW().getHours()
					+ ":" + NOW().getMinutes()
					+ ":" + NOW().getSeconds();

				let msg = setting["webhook.body"];
				msg = msg.replace("%Depth%", data.depth == null ? "?" : data.depth).replace("%NorthLatitude%", data.lat).replace("%Time%", showtime).replace("%EastLongitude%", data.lon).replace("%location%", data.location).replace("%Scale%", data.scale == null ? "?" : data.scale).replace("%Number%", data.number);

				if (data.type == "eew-cwb")
					msg = msg.replace("%Provider%", "中央氣象局 (CWB)");
				else if (data.type == "eew-scdzj")
					msg = msg.replace("%Provider%", "四川省地震局 (SCDZJ)");
				else if (data.type == "eew-fjdzj")
					msg = msg.replace("%Provider%", "福建省地震局 (FJDZJ)");
				else if (data.type == "eew-nied")
					msg = msg.replace("%Provider%", "防災科学技術研究所 (NIED)");
				else if (data.type == "eew-jma")
					msg = msg.replace("%Provider%", "気象庁(JMA)");
				else if (data.type == "eew-kma")
					msg = msg.replace("%Provider%", "기상청(KMA)");
				else
					msg = msg.replace("%Provider%", data.Unit);

				msg = JSON.parse(msg);
				msg.username = "TREM | 臺灣即時地震監測";

				msg.embeds[0].image.url = "";
				msg.embeds[0].footer = {
					text     : `ExpTech Studio ${Now1}`,
					icon_url : "https://raw.githubusercontent.com/ExpTechTW/API/master/image/Icon/ExpTech.png",
				};
				msg.tts = setting["tts.Notification"];
				msg.content = setting["tts.Notification"] ? (showtime + "左右發生顯著有感地震東經" + data.lon + "北緯" + data.lat + "位於" + data.location + "深度" + (data.depth == null ? "?" : data.depth + "公里") + "規模" + (data.scale == null ? "?" : data.scale) + "第" + data.number + "報發報單位" + data.Unit + "慎防強烈搖晃，就近避難 [趴下、掩護、穩住]") : "";
				log("Posting No trem-eew Webhook", 1, "Webhook", "eew");
				dump({ level: 0, message: "Posting Webhook", origin: "Webhook" });
				fetch(setting["webhook.url"], {
					method  : "POST",
					headers : { "Content-Type": "application/json" },
					body    : JSON.stringify(msg),
				}).catch((error) => {
					log(error, 3, "Webhook", "eew");
					dump({ level: 2, message: error, origin: "Webhook" });
				});
			}
		}, 2000);
});
// #endregion

// #region Event: eewEnd
TREM.Earthquake.on("eewEnd", (id, type) => {
	clear(id, type);
});
// #endregion

TREM.Earthquake.on("trem-eq", (data) => {
	console.log(data);
	const now = new Date(data.time);
	const Now2 = now.getFullYear()
	+ "/" + (now.getMonth() + 1 < 10 ? "0" : "") + (now.getMonth() + 1)
	+ "/" + (now.getDate() < 10 ? "0" : "") + now.getDate()
	+ " " + (now.getHours() < 10 ? "0" : "") + now.getHours()
	+ ":" + (now.getMinutes() < 10 ? "0" : "") + now.getMinutes()
	+ ":" + (now.getSeconds() < 10 ? "0" : "") + now.getSeconds();
	const _now = new Date(data.timestamp);
	const _Now = _now.getFullYear()
	+ "/" + (_now.getMonth() + 1 < 10 ? "0" : "") + (_now.getMonth() + 1)
	+ "/" + (_now.getDate() < 10 ? "0" : "") + _now.getDate()
	+ " " + (_now.getHours() < 10 ? "0" : "") + _now.getHours()
	+ ":" + (_now.getMinutes() < 10 ? "0" : "") + _now.getMinutes()
	+ ":" + (_now.getSeconds() < 10 ? "0" : "") + _now.getSeconds();

	if (setting["webhook.url"] != "" && setting["trem-eq.alert.Notification"] && data.alert) {
		let state_station;
		let Max_Intensity = 0;
		let description = "警報\n";
		description += `\n開始時間 > ${Now2}\n\n`;

		for (let index = 0, keys = Object.keys(data.list), n = keys.length; index < n; index++) {
			if (data.list[keys[index]] > Max_Intensity) Max_Intensity = data.list[keys[index]];
			description += `${station[keys[index]].Loc} 最大震度 > ${IntensityI(data.list[keys[index]])}\n`;
			state_station = index + 1;
		}

		description += `\n第 ${data.number} 報 | ${data.data_count} 筆數據 ${data.final ? "(最終報)" : ""}\n`;
		description += `共 ${state_station} 站觸發 | 全部 ${data.total_station} 站\n`;
		description += `現在時間 > ${_Now}\n`;
		// console.log(description);
		const msg = {
			username   : "TREM | 臺灣即時地震監測",
			avatar_url : "https://raw.githubusercontent.com/ExpTechTW/API/%E4%B8%BB%E8%A6%81%E7%9A%84-(main)/image/Icon/ExpTech.png",
			content    : setting["tts.Notification"] ? ((data.final ? "地震檢知(最終報)" : "地震檢知") + description) : "地震檢知",
			tts        : setting["tts.Notification"],
			embeds     : [
				{
					author: {
						name     : data.final ? "地震檢知(最終報)" : "地震檢知",
						url      : `https://exptech.com.tw/api/v1/file?path=/trem-report.html&id=${data.report_id}`,
						icon_url : undefined,
					},
					description : description,
					color       : 15158332,
				},
			],
		};

		if (setting["trem-eq.alert.Notification.Intensity"] <= Max_Intensity) {
			log("Posting Notification trem-eq alert Webhook", 1, "Webhook", "trem-eq");
			dump({ level: 0, message: "Posting Notification trem-eq alert Webhook", origin: "Webhook" });
			fetch(setting["webhook.url"], {
				method  : "POST",
				headers : { "Content-Type": "application/json" },
				body    : JSON.stringify(msg),
			}).catch((error) => {
				log(error, 3, "Webhook", "trem-eq");
				dump({ level: 2, message: error, origin: "Webhook" });
			});
		}
	} else if (setting["webhook.url"] != "" && setting["trem-eq.Notification"] && setting["dev.mode"]) {
		let state_station;
		let description = "";

		if (data.cancel)
			description += "取消\n";
		else if (data.alert)
			description += "警報\n";
		else
			description += "預報\n";

		description += `\n開始時間 > ${Now2}\n\n`;

		for (let index = 0, keys = Object.keys(data.list), n = keys.length; index < n; index++) {
			description += `${station[keys[index]].Loc} 最大震度 > ${IntensityI(data.list[keys[index]])}\n`;
			state_station = index + 1;
		}

		description += `\n第 ${data.number} 報 | ${data.data_count} 筆數據 ${data.final ? "(最終報)" : ""}\n`;
		description += `共 ${state_station} 站觸發 | 全部 ${data.total_station} 站\n`;
		description += `現在時間 > ${_Now}\n`;
		// console.log(description);
		const msg = {
			username   : "TREM | 臺灣即時地震監測",
			avatar_url : "https://raw.githubusercontent.com/ExpTechTW/API/%E4%B8%BB%E8%A6%81%E7%9A%84-(main)/image/Icon/ExpTech.png",
			content    : setting["tts.Notification"] ? ((data.final ? "地震檢知(最終報)" : "地震檢知") + description) : "地震檢知",
			tts        : setting["tts.Notification"],
			embeds     : [
				{
					author: {
						name     : data.final ? "地震檢知(最終報)" : "地震檢知",
						url      : (data.alert) ? `https://exptech.com.tw/api/v1/file?path=/trem-report.html&id=${data.report_id}` : "",
						icon_url : undefined,
					},
					description : description,
					color       : (data.cancel) ? 9807270 : (data.alert) ? 15158332 : 15105570,
				},
			],
		};
		log("Posting dev mode Notification trem-eq alert Webhook", 1, "Webhook", "trem-eq");
		dump({ level: 0, message: "Posting dev mode Notification trem-eq Webhook", origin: "Webhook" });
		fetch(setting["webhook.url"], {
			method  : "POST",
			headers : { "Content-Type": "application/json" },
			body    : JSON.stringify(msg),
		}).catch((error) => {
			log(error, 3, "Webhook", "trem-eq");
			dump({ level: 2, message: error, origin: "Webhook" });
		});
	}
});

TREM.Earthquake.on("tsunami", (data) => {
	console.log(data);

	if (data.cancel) {
		if (speecd_use) TREM.speech.speak({ text: "海嘯警報已解除" });

		if (TREM.Detector.webgl || TREM.MapRenderingEngine == "mapbox-gl") {
			if (Maps.main.getFeatureState({
				source      : "Source_EN",
				sourceLayer : "Layer_EN",
				id          : "1",
			})) {
				Maps.main.removeFeatureState({ source: "Source_EN" });
				Maps.main.setLayoutProperty("Layer_EN", "visibility", "none");
			}

			if (Maps.main.getFeatureState({
				source      : "Source_E",
				sourceLayer : "Layer_E",
				id          : "1",
			})) {
				Maps.main.removeFeatureState({ source: "Source_E" });
				Maps.main.setLayoutProperty("Layer_E", "visibility", "none");
			}

			if (Maps.main.getFeatureState({
				source      : "Source_ES",
				sourceLayer : "Layer_ES",
				id          : "1",
			})) {
				Maps.main.removeFeatureState({ source: "Source_ES" });
				Maps.main.setLayoutProperty("Layer_ES", "visibility", "none");
			}

			if (Maps.main.getFeatureState({
				source      : "Source_N",
				sourceLayer : "Layer_N",
				id          : "1",
			})) {
				Maps.main.removeFeatureState({ source: "Source_N" });
				Maps.main.setLayoutProperty("Layer_N", "visibility", "none");
			}

			if (Maps.main.getFeatureState({
				source      : "Source_W",
				sourceLayer : "Layer_W",
				id          : "1",
			})) {
				Maps.main.removeFeatureState({ source: "Source_W" });
				Maps.main.setLayoutProperty("Layer_W", "visibility", "none");
			}

			if (Maps.main.getFeatureState({
				source      : "Source_WS",
				sourceLayer : "Layer_WS",
				id          : "1",
			})) {
				Maps.main.removeFeatureState({ source: "Source_WS" });
				Maps.main.setLayoutProperty("Layer_WS", "visibility", "none");
			}
		} else if (!TREM.Detector.webgl || TREM.MapRenderingEngine == "leaflet") {
			if (TSUNAMI.E)
				TSUNAMI.E.remove();

			if (TSUNAMI.EN)
				TSUNAMI.EN.remove();

			if (TSUNAMI.ES)
				TSUNAMI.ES.remove();

			if (TSUNAMI.N)
				TSUNAMI.N.remove();

			if (TSUNAMI.WS)
				TSUNAMI.WS.remove();

			if (TSUNAMI.W)
				TSUNAMI.W.remove();

			if (TSUNAMI.warnIcon)
				TSUNAMI.warnIcon.remove();
			TSUNAMI = {};
		}

		Mapsmainfocus();
	} else {
		if (speecd_use) TREM.speech.speak({ text: "海嘯警報已發布，請迅速疏散至避難場所" });

		if (data.number == 1) {
			if (setting["report.show"]) win.showInactive();

			if (setting["report.cover"])
				if (!win.isFullScreen()) {
					win.setAlwaysOnTop(true);
					win.focus();
					win.setAlwaysOnTop(false);
				}

			if (setting["audio.report"]) audioPlay("../audio/Water.wav");
			Mapsmainfocus();
		}

		// if (!TSUNAMI.warnIcon) {
		// 	const warnIcon = L.icon({
		// 		iconUrl   : "../image/warn.png",
		// 		iconSize  : [30, 30],
		// 		className : "tsunami",
		// 	});
		// 	TSUNAMI.warnIcon = L.marker([+data.lat, +data.lon], { icon: warnIcon }).addTo(Maps.main);
		// } else {
		// 	TSUNAMI.warnIcon.setLatLng([+data.lat, +data.lon]);
		// }

		for (let i = 0; i < data.area.length; i++) {
			if (!data.area[i].arrivalTime) continue;
			const now = new Date(data.area[i].arrivalTime);
			const Now3 = now.getFullYear()
				+ "/" + (now.getMonth() + 1)
				+ "/" + now.getDate()
				+ " " + now.getHours()
				+ ":" + now.getMinutes();
			new Notification("海嘯警報", {
				body   : `${Now3} 發生地震\n請${data.area[i].areaName}迅速疏散至避難場所`,
				icon   : "../TREM.ico",
				silent : win.isFocused(),
			});

			if (data.area[i].areaName == "東北沿海地區") {
				if (TREM.Detector.webgl || TREM.MapRenderingEngine == "mapbox-gl")
					if (!Maps.main.getFeatureState({
						source      : "Source_EN",
						sourceLayer : "Layer_EN",
						id          : "1",
					})) {
						Maps.main.setFeatureState({
							source : "Source_EN",
							id     : "1",
						}, { color: tsunami_color_int(data.area[i].waveHeight) });
						Maps.main.setLayoutProperty("Layer_EN", "visibility", "visible");
					} else {
						Maps.main.removeFeatureState({ source: "Source_EN" });
						Maps.main.setLayoutProperty("Layer_EN", "visibility", "none");
						Maps.main.setFeatureState({
							source : "Source_EN",
							id     : "1",
						}, { color: tsunami_color_int(data.area[i].waveHeight) });
						Maps.main.setLayoutProperty("Layer_EN", "visibility", "visible");
					}
				else if (!TREM.Detector.webgl || TREM.MapRenderingEngine == "leaflet")
					if (!TSUNAMI.EN) {
						TSUNAMI.EN = L.geoJson.vt(MapData.EN, {
							minZoom   : 4,
							maxZoom   : 12,
							tolerance : 20,
							buffer    : 256,
							debug     : 0,
							zIndex    : 5,
							style     : (args) => ({
								color       : tsunami_color(data.area[i].waveHeight),
								weight      : 10,
								opacity     : 1,
								fillColor   : "transparent",
								fillOpacity : 1,
								fill        : false,
							}),
						}).addTo(Maps.main);
						L.DomUtil.addClass(TSUNAMI.EN._container, "tsunami");
					} else {
						TSUNAMI.EN.remove();
						TSUNAMI.EN = L.geoJson.vt(MapData.EN, {
							minZoom   : 4,
							maxZoom   : 12,
							tolerance : 20,
							buffer    : 256,
							debug     : 0,
							zIndex    : 5,
							style     : (args) => ({
								color       : tsunami_color(data.area[i].waveHeight),
								weight      : 10,
								opacity     : 1,
								fillColor   : "transparent",
								fillOpacity : 1,
								fill        : false,
							}),
						}).addTo(Maps.main);
						L.DomUtil.addClass(TSUNAMI.EN._container, "tsunami");
					}

			} else if (data.area[i].areaName == "東部沿海地區") {
				if (TREM.Detector.webgl || TREM.MapRenderingEngine == "mapbox-gl")
					if (!Maps.main.getFeatureState({
						source      : "Source_E",
						sourceLayer : "Layer_E",
						id          : "1",
					})) {
						Maps.main.setFeatureState({
							source : "Source_E",
							id     : "1",
						}, { color: tsunami_color_int(data.area[i].waveHeight) });
						Maps.main.setLayoutProperty("Layer_E", "visibility", "visible");
					} else {
						Maps.main.removeFeatureState({ source: "Source_E" });
						Maps.main.setLayoutProperty("Layer_E", "visibility", "none");
						Maps.main.setFeatureState({
							source : "Source_E",
							id     : "1",
						}, { color: tsunami_color_int(data.area[i].waveHeight) });
						Maps.main.setLayoutProperty("Layer_E", "visibility", "visible");
					}
				else if (!TREM.Detector.webgl || TREM.MapRenderingEngine == "leaflet")
					if (!TSUNAMI.E) {
						TSUNAMI.E = L.geoJson.vt(MapData.E, {
							minZoom   : 4,
							maxZoom   : 12,
							tolerance : 20,
							buffer    : 256,
							debug     : 0,
							zIndex    : 5,
							style     : (args) => ({
								color       : tsunami_color(data.area[i].waveHeight),
								weight      : 10,
								opacity     : 1,
								fillColor   : "transparent",
								fillOpacity : 1,
								fill        : false,
							}),
						}).addTo(Maps.main);
						L.DomUtil.addClass(TSUNAMI.E._container, "tsunami");
					} else {
						TSUNAMI.E.remove();
						TSUNAMI.E = L.geoJson.vt(MapData.E, {
							minZoom   : 4,
							maxZoom   : 12,
							tolerance : 20,
							buffer    : 256,
							debug     : 0,
							zIndex    : 5,
							style     : (args) => ({
								color       : tsunami_color(data.area[i].waveHeight),
								weight      : 10,
								opacity     : 1,
								fillColor   : "transparent",
								fillOpacity : 1,
								fill        : false,
							}),
						}).addTo(Maps.main);
						L.DomUtil.addClass(TSUNAMI.E._container, "tsunami");
					}

			} else if (data.area[i].areaName == "東南沿海地區") {
				if (TREM.Detector.webgl || TREM.MapRenderingEngine == "mapbox-gl")
					if (!Maps.main.getFeatureState({
						source      : "Source_ES",
						sourceLayer : "Layer_ES",
						id          : "1",
					})) {
						Maps.main.setFeatureState({
							source : "Source_ES",
							id     : "1",
						}, { color: tsunami_color_int(data.area[i].waveHeight) });
						Maps.main.setLayoutProperty("Layer_ES", "visibility", "visible");
					} else {
						Maps.main.removeFeatureState({ source: "Source_ES" });
						Maps.main.setLayoutProperty("Layer_ES", "visibility", "none");
						Maps.main.setFeatureState({
							source : "Source_ES",
							id     : "1",
						}, { color: tsunami_color_int(data.area[i].waveHeight) });
						Maps.main.setLayoutProperty("Layer_ES", "visibility", "visible");
					}
				else if (!TREM.Detector.webgl || TREM.MapRenderingEngine == "leaflet")
					if (!TSUNAMI.ES) {
						TSUNAMI.ES = L.geoJson.vt(MapData.ES, {
							minZoom   : 4,
							maxZoom   : 12,
							tolerance : 20,
							buffer    : 256,
							debug     : 0,
							zIndex    : 5,
							style     : (args) => ({
								color       : tsunami_color(data.area[i].waveHeight),
								weight      : 10,
								opacity     : 1,
								fillColor   : "transparent",
								fillOpacity : 1,
								fill        : false,
							}),
						}).addTo(Maps.main);
						L.DomUtil.addClass(TSUNAMI.ES._container, "tsunami");
					} else {
						TSUNAMI.ES.remove();
						TSUNAMI.ES = L.geoJson.vt(MapData.ES, {
							minZoom   : 4,
							maxZoom   : 12,
							tolerance : 20,
							buffer    : 256,
							debug     : 0,
							zIndex    : 5,
							style     : (args) => ({
								color       : tsunami_color(data.area[i].waveHeight),
								weight      : 10,
								opacity     : 1,
								fillColor   : "transparent",
								fillOpacity : 1,
								fill        : false,
							}),
						}).addTo(Maps.main);
						L.DomUtil.addClass(TSUNAMI.ES._container, "tsunami");
					}

			} else if (data.area[i].areaName == "北部沿海地區") {
				if (TREM.Detector.webgl || TREM.MapRenderingEngine == "mapbox-gl")
					if (!Maps.main.getFeatureState({
						source      : "Source_N",
						sourceLayer : "Layer_N",
						id          : "1",
					})) {
						Maps.main.setFeatureState({
							source : "Source_N",
							id     : "1",
						}, { color: tsunami_color_int(data.area[i].waveHeight) });
						Maps.main.setLayoutProperty("Layer_N", "visibility", "visible");
					} else {
						Maps.main.removeFeatureState({ source: "Source_N" });
						Maps.main.setLayoutProperty("Layer_N", "visibility", "none");
						Maps.main.setFeatureState({
							source : "Source_N",
							id     : "1",
						}, { color: tsunami_color_int(data.area[i].waveHeight) });
						Maps.main.setLayoutProperty("Layer_N", "visibility", "visible");
					}
				else if (!TREM.Detector.webgl || TREM.MapRenderingEngine == "leaflet")
					if (!TSUNAMI.N) {
						TSUNAMI.N = L.geoJson.vt(MapData.N, {
							minZoom   : 4,
							maxZoom   : 12,
							tolerance : 20,
							buffer    : 256,
							debug     : 0,
							zIndex    : 5,
							style     : (args) => ({
								color       : tsunami_color(data.area[i].waveHeight),
								weight      : 10,
								opacity     : 1,
								fillColor   : "transparent",
								fillOpacity : 1,
								fill        : false,
							}),
						}).addTo(Maps.main);
						L.DomUtil.addClass(TSUNAMI.N._container, "tsunami");
					} else {
						TSUNAMI.N.remove();
						TSUNAMI.N = L.geoJson.vt(MapData.N, {
							minZoom   : 4,
							maxZoom   : 12,
							tolerance : 20,
							buffer    : 256,
							debug     : 0,
							zIndex    : 5,
							style     : (args) => ({
								color       : tsunami_color(data.area[i].waveHeight),
								weight      : 10,
								opacity     : 1,
								fillColor   : "transparent",
								fillOpacity : 1,
								fill        : false,
							}),
						}).addTo(Maps.main);
						L.DomUtil.addClass(TSUNAMI.N._container, "tsunami");
					}

			} else if (data.area[i].areaName == "海峽沿海地區") {
				if (TREM.Detector.webgl || TREM.MapRenderingEngine == "mapbox-gl")
					if (!Maps.main.getFeatureState({
						source      : "Source_W",
						sourceLayer : "Layer_W",
						id          : "1",
					})) {
						Maps.main.setFeatureState({
							source : "Source_W",
							id     : "1",
						}, { color: tsunami_color_int(data.area[i].waveHeight) });
						Maps.main.setLayoutProperty("Layer_W", "visibility", "visible");
					} else {
						Maps.main.removeFeatureState({ source: "Source_W" });
						Maps.main.setLayoutProperty("Layer_W", "visibility", "none");
						Maps.main.setFeatureState({
							source : "Source_W",
							id     : "1",
						}, { color: tsunami_color_int(data.area[i].waveHeight) });
						Maps.main.setLayoutProperty("Layer_W", "visibility", "visible");
					}
				else if (!TREM.Detector.webgl || TREM.MapRenderingEngine == "leaflet")
					if (!TSUNAMI.W) {
						TSUNAMI.W = L.geoJson.vt(MapData.W, {
							minZoom   : 4,
							maxZoom   : 12,
							tolerance : 20,
							buffer    : 256,
							debug     : 0,
							zIndex    : 5,
							style     : (args) => ({
								color       : tsunami_color(data.area[i].waveHeight),
								weight      : 10,
								opacity     : 1,
								fillColor   : "transparent",
								fillOpacity : 1,
								fill        : false,
							}),
						}).addTo(Maps.main);
						L.DomUtil.addClass(TSUNAMI.W._container, "tsunami");
					} else {
						TSUNAMI.W.remove();
						TSUNAMI.W = L.geoJson.vt(MapData.W, {
							minZoom   : 4,
							maxZoom   : 12,
							tolerance : 20,
							buffer    : 256,
							debug     : 0,
							zIndex    : 5,
							style     : (args) => ({
								color       : tsunami_color(data.area[i].waveHeight),
								weight      : 10,
								opacity     : 1,
								fillColor   : "transparent",
								fillOpacity : 1,
								fill        : false,
							}),
						}).addTo(Maps.main);
						L.DomUtil.addClass(TSUNAMI.W._container, "tsunami");
					}

			} else if (data.area[i].areaName == "西南沿海地區") {
				if (TREM.Detector.webgl || TREM.MapRenderingEngine == "mapbox-gl")
					if (!Maps.main.getFeatureState({
						source      : "Source_WS",
						sourceLayer : "Layer_WS",
						id          : "1",
					})) {
						Maps.main.setFeatureState({
							source : "Source_WS",
							id     : "1",
						}, { color: tsunami_color_int(data.area[i].waveHeight) });
						Maps.main.setLayoutProperty("Layer_WS", "visibility", "visible");
					} else {
						Maps.main.removeFeatureState({ source: "Source_WS" });
						Maps.main.setLayoutProperty("Layer_WS", "visibility", "none");
						Maps.main.setFeatureState({
							source : "Source_WS",
							id     : "1",
						}, { color: tsunami_color_int(data.area[i].waveHeight) });
						Maps.main.setLayoutProperty("Layer_WS", "visibility", "visible");
					}
				else if (!TREM.Detector.webgl || TREM.MapRenderingEngine == "leaflet")
					if (!TSUNAMI.WS) {
						TSUNAMI.WS = L.geoJson.vt(MapData.WS, {
							minZoom   : 4,
							maxZoom   : 12,
							tolerance : 20,
							buffer    : 256,
							debug     : 0,
							zIndex    : 5,
							style     : (args) => ({
								color       : tsunami_color(data.area[i].waveHeight),
								weight      : 10,
								opacity     : 1,
								fillColor   : "transparent",
								fillOpacity : 1,
								fill        : false,
							}),
						}).addTo(Maps.main);
						L.DomUtil.addClass(TSUNAMI.WS._container, "tsunami");
					} else {
						TSUNAMI.WS.remove();
						TSUNAMI.WS = L.geoJson.vt(MapData.WS, {
							minZoom   : 4,
							maxZoom   : 12,
							tolerance : 20,
							buffer    : 256,
							debug     : 0,
							zIndex    : 5,
							style     : (args) => ({
								color       : tsunami_color(data.area[i].waveHeight),
								weight      : 10,
								opacity     : 1,
								fillColor   : "transparent",
								fillOpacity : 1,
								fill        : false,
							}),
						}).addTo(Maps.main);
						L.DomUtil.addClass(TSUNAMI.WS._container, "tsunami");
					}
			}
		}
	}
});

function main(data) {
	if (showDialogtime) {
		lockScroll(false);
		$("#modal-overlay").fadeOut(0);
		showDialogtime.close();
	}

	if (TREM.EEW.get(INFO[TINFO]?.ID).Cancel == undefined && data.type != "trem-eew") {
		if (data.depth != null) {

			const wave = { p: 7, s: 4 };

			/**
			 * @type {{p:number,s:number}}
			 */

			let kmP = Math.floor(Math.sqrt(Math.pow((NOW().getTime() - data.time) * wave.p, 2) - Math.pow(data.depth * 1000, 2)));
			let km = Math.floor(Math.sqrt(Math.pow((NOW().getTime() - data.time) * wave.s, 2) - Math.pow(data.depth * 1000, 2)));

			/**
			* PS 波已走公尺數
			* @type {number} kmP
			* @type {number} km
			*/
			for (let index = 1; index < EarthquakeList[data.id].distance.length; index++)
				if (EarthquakeList[data.id].distance[index].Ptime > (NOW().getTime() - data.time) / 1000) {
					kmP = (index - 1) * 1000;

					if ((index - 1) / EarthquakeList[data.id].distance[index - 1].Ptime > wave.p) kmP = Math.floor(Math.sqrt(Math.pow((NOW().getTime() - data.time) * wave.p, 2) - Math.pow(data.depth * 1000, 2)));
					break;
				}

			for (let index = 1; index < EarthquakeList[data.id].distance.length; index++)
				if (EarthquakeList[data.id].distance[index].Stime > (NOW().getTime() - data.time) / 1000) {
					km = (index - 1) * 1000;

					if ((index - 1) / EarthquakeList[data.id].distance[index - 1].Stime > wave.s) km = Math.floor(Math.sqrt(Math.pow((NOW().getTime() - data.time) * wave.s, 2) - Math.pow(data.depth * 1000, 2)));
					break;
				}

			if (setting["shock.p"])
				if (kmP > 0)
					if (TREM.Detector.webgl || TREM.MapRenderingEngine == "mapbox-gl") {
						if (!EarthquakeList[data.id].CircleP) {
							EarthquakeList[data.id].CircleP = new WaveCircle(
								`${data.id}-p`,
								Maps.main,
								[+data.lon, +data.lat],
								kmP,
								data.Alert,
								{
									type  : "line",
									paint : {
										"line-width" : 4,
										"line-color" : "#6FB7B7",
									},
								});
						} else {
							EarthquakeList[data.id].CircleP.setLngLat([+data.lon, +data.lat]);
							EarthquakeList[data.id].CircleP.setRadius(kmP);
						}
					} else if (!TREM.Detector.webgl || TREM.MapRenderingEngine == "leaflet") {
						if (!EarthquakeList[data.id].CircleP)
							EarthquakeList[data.id].CircleP = L.circle([+data.lat, +data.lon], {
								color     : "#6FB7B7",
								fillColor : "transparent",
								radius    : kmP,
								renderer  : L.svg(),
								className : "p-wave",
							}).addTo(Maps.main);

						if (!EarthquakeList[data.id].CircleP.getLatLng().equals([+data.lat, +data.lon]))
							EarthquakeList[data.id].CircleP
								.setLatLng([+data.lat, +data.lon]);

						EarthquakeList[data.id].CircleP
							.setRadius(kmP);

						if (!EarthquakeList[data.id].CirclePTW)
							EarthquakeList[data.id].CirclePTW = L.circle([data.lat, data.lon], {
								color     : "#6FB7B7",
								fillColor : "transparent",
								radius    : kmP,
								renderer  : L.svg(),
								className : "p-wave",
							}).addTo(Maps.mini);

						if (!EarthquakeList[data.id].CirclePTW.getLatLng().equals([+data.lat, +data.lon]))
							EarthquakeList[data.id].CirclePTW
								.setLatLng([+data.lat, +data.lon]);

						EarthquakeList[data.id].CirclePTW
							.setRadius(kmP);
					}

			if (km > data.depth * 100) {
				if (TREM.EEW.get(data.id).waveProgress) {
					TREM.EEW.get(data.id).waveProgress.remove();
					delete TREM.EEW.get(data.id).waveProgress;
				}

				eew[data.id].km = km;

				if (TREM.Detector.webgl || TREM.MapRenderingEngine == "mapbox-gl") {
					if (!EarthquakeList[data.id].CircleS) {
						EarthquakeList[data.id].CircleS = new WaveCircle(
							`${data.id}-s`,
							Maps.main,
							[+data.lon, +data.lat],
							km,
							data.Alert,
							{
								type  : "fill",
								paint : {
									"fill-opacity" : 0.15,
									"fill-color"   : data.Alert ? "#FF0000" : "#FFA500",
								},
							});
					} else {
						EarthquakeList[data.id].CircleS.setLngLat([+data.lon, +data.lat]);
						EarthquakeList[data.id].CircleS.setRadius(km);
						EarthquakeList[data.id].CircleS.setAlert(data.Alert);
					}
				} else if (!TREM.Detector.webgl || TREM.MapRenderingEngine == "leaflet") {
					if (!EarthquakeList[data.id].CircleS)
						EarthquakeList[data.id].CircleS = L.circle([+data.lat, +data.lon], {
							color       : data.Alert ? "red" : "orange",
							fillColor   : `url(#${data.Alert ? "alert" : "pred"}-gradient)`,
							fillOpacity : 1,
							radius      : km,
							renderer    : L.svg(),
							className   : "s-wave",
						}).addTo(Maps.main);

					if (!EarthquakeList[data.id].CircleS.getLatLng().equals([+data.lat, +data.lon]))
						EarthquakeList[data.id].CircleS
							.setLatLng([+data.lat, +data.lon]);

					EarthquakeList[data.id].CircleS
						.setRadius(km)
						.setStyle(
							{
								color     : data.Alert ? "red" : "orange",
								fillColor : `url(#${data.Alert ? "alert" : "pred"}-gradient)`,
							},
						);
				}

				if (!EarthquakeList[data.id].CircleSTW)
					EarthquakeList[data.id].CircleSTW = L.circle([+data.lat, +data.lon], {
						color       : data.Alert ? "red" : "orange",
						fillColor   : `url(#${data.Alert ? "alert" : "pred"}-gradient)`,
						fillOpacity : 1,
						radius      : km,
						renderer    : L.svg(),
						className   : "s-wave",
					}).addTo(Maps.mini);

				if (!EarthquakeList[data.id].CircleSTW.getLatLng().equals([+data.lat, +data.lon]))
					EarthquakeList[data.id].CircleSTW
						.setLatLng([+data.lat, +data.lon]);

				EarthquakeList[data.id].CircleSTW
					.setRadius(km)
					.setStyle(
						{
							color     : data.Alert ? "red" : "orange",
							fillColor : `url(#${data.Alert ? "alert" : "pred"}-gradient)`,
						},
					);
			} else {
				const num = (NOW().getTime() - data.time) / 10 / EarthquakeList[data.id].distance[1].Stime;
				const icon = L.divIcon({
					className : "progress_bar",
					html      : `<div style="background-color: aqua;height: ${num}%;"></div>`,
					iconSize  : [5, 50],
				});

				if (!TREM.EEW.get(data.id).waveProgress) {
					if (EarthquakeList[data.id].CircleS) {
						EarthquakeList[data.id].CircleS.remove();
						EarthquakeList[data.id].CircleS = null;
					} else if (EarthquakeList[data.id].CircleSTW) {
						EarthquakeList[data.id].CircleSTW.remove();
						EarthquakeList[data.id].CircleSTW = null;
					}

					if (EarthquakeList[data.id].CircleP) {
						EarthquakeList[data.id].CircleP.remove();
						EarthquakeList[data.id].CircleP = null;
					} else if (EarthquakeList[data.id].CirclePTW) {
						EarthquakeList[data.id].CirclePTW.remove();
						EarthquakeList[data.id].CirclePTW = null;
					}

					if (TREM.Detector.webgl || TREM.MapRenderingEngine == "mapbox-gl")
						TREM.EEW.get(data.id).waveProgress = new maplibregl.Marker({ element: $(`<div class="s-wave-progress-container"><div class="s-wave-progress" style="height:${num}%;"></div></div>`)[0] })
							.setLngLat([+data.lon, +data.lat])
							.addTo(Maps.main);
					else if (!TREM.Detector.webgl || TREM.MapRenderingEngine == "leaflet")
						TREM.EEW.get(data.id).waveProgress = L.marker([+data.lat, +data.lon + 0.15], { icon: icon }).addTo(Maps.main);
				} else if (TREM.Detector.webgl || TREM.MapRenderingEngine == "mapbox-gl") {
					TREM.EEW.get(data.id).waveProgress.getElement().firstChild.style.height = `${num}%`;
				} else if (!TREM.Detector.webgl || TREM.MapRenderingEngine == "leaflet") {
					TREM.EEW.get(data.id).waveProgress.setIcon(icon);
				}
			}
		}

		if (data.cancel)
			for (let index = 0; index < INFO.length; index++)
				if (INFO[index].ID == data.id) {
					INFO[index].alert_type = "alert-box eew-cancel";
					data.timestamp = NOW().getTime() - ((data.lon < 122.18 && data.lat < 25.47 && data.lon > 118.25 && data.lat > 21.77) ? 90_000 : 150_000);

					if (TREM.EEW.get(data.id).waveProgress) {
						TREM.EEW.get(data.id).waveProgress.remove();
						delete TREM.EEW.get(data.id).waveProgress;
					}

					TREM.Earthquake.emit("eewEnd", data.id);
					TREM.EEW.get(INFO[TINFO].ID).Cancel = true;

					if (Object.keys(EarthquakeList).length == 1) {
						clearInterval(eew[data.id].t);
						audio.main = [];
						audio.minor = [];
					}

					break;
				}
	}

	// #region Epicenter Cross Icon

	let epicenterIcon;
	let offsetX = 0;
	let offsetY = 0;

	const cursor = INFO.findIndex((v) => v.ID == data.id) + 1;
	const iconUrl = cursor <= 4 && INFO.length > 1 ? `../image/cross${cursor}.png` : "../image/cross.png";

	if (cursor <= 4 && INFO.length > 1) {
		epicenterIcon = L.icon({
			iconUrl,
			iconSize  : [40, 40],
			className : "epicenterIcon",
		});

		if (cursor == 1) offsetY = 0.03;

		if (cursor == 2) offsetX = 0.03;

		if (cursor == 3) offsetY = -0.03;

		if (cursor == 4) offsetX = -0.03;

	} else {
		epicenterIcon = L.icon({
			iconUrl,
			iconSize  : [30, 30],
			className : "epicenterIcon",
		});
	}

	let epicenterIcon_tooltip = "";

	// main map
	if (!EarthquakeList[data.id].epicenterIcon)
		if (TREM.Detector.webgl || TREM.MapRenderingEngine == "mapbox-gl") {
			epicenterIcon_tooltip = `<div class="marker-popup rt-station-popup rt-station-detail-container"><span>${data.Unit}</span><span>注意 ${cursor}</span><span>第 ${data.number} 報</span><span>規模: ${data.scale == null ? "?" : data.scale}</span><span>深度: ${data.depth == null ? "?" : data.depth} km</span></div>`;
			const epicenterIcon_tooltip_popup = new maplibregl.Popup({ closeOnClick: false, closeButton: false });
			EarthquakeList[data.id].epicenterIcon = new maplibregl.Marker(
				{
					element: $(`<img class="epicenterIcon" height="40" width="40" src="${iconUrl}"></img>`)[0],
				})
				.setLngLat([+data.lon, +data.lat])
				.setPopup(epicenterIcon_tooltip_popup.setHTML(epicenterIcon_tooltip))
				.addTo(Maps.main);
			EarthquakeList[data.id].epicenterIcon.getElement().addEventListener("mouseover", () => {
				epicenterIcon_tooltip_popup.setLngLat([+data.lon, +data.lat]).setHTML(epicenterIcon_tooltip).addTo(Maps.main);
			});
			EarthquakeList[data.id].epicenterIcon.getElement().addEventListener("mouseleave", () => {
				epicenterIcon_tooltip_popup.remove();
			});
		} else if (!TREM.Detector.webgl || TREM.MapRenderingEngine == "leaflet") {
			epicenterIcon_tooltip = `<div>${data.Unit}</div><div>注意 ${cursor}</div><div>第 ${data.number} 報</div><div>規模: ${data.scale == null ? "?" : data.scale}</div><div>深度: ${data.depth == null ? "?" : data.depth} km</div>`;
			EarthquakeList[data.id].epicenterIcon = L.marker([+data.lat, +data.lon],
				{
					icon         : epicenterIcon,
					zIndexOffset : 6000,
				})
				.addTo(Maps.main)
				.bindTooltip(epicenterIcon_tooltip, {
					offset    : [8, 0],
					permanent : false,
					className : "eew-cursor-tooltip",
				});
		}

	if (EarthquakeList[data.id].epicenterIcon.getElement().src != iconUrl)
		EarthquakeList[data.id].epicenterIcon.getElement().src = iconUrl;

	if (TREM.Detector.webgl || TREM.MapRenderingEngine == "mapbox-gl")
		EarthquakeList[data.id].epicenterIcon.setLngLat([+data.lon, +data.lat]);
	else if (TREM.MapRenderingEngine == "leaflet")
		EarthquakeList[data.id].epicenterIcon.setLatLng([+data.lat, +data.lon]);

	// mini map
	if (!EarthquakeList[data.id].epicenterIconTW) {
		EarthquakeList[data.id].epicenterIconTW = L.marker([+data.lat + offsetY, +data.lon + offsetX], { icon: epicenterIcon }).addTo(Maps.mini);
		EarthquakeList[data.id].epicenterIconTW.getElement().classList.add("hide");
	}

	if (EarthquakeList[data.id].epicenterIconTW.getIcon()?.options?.iconUrl != epicenterIcon.options.iconUrl)
		EarthquakeList[data.id].epicenterIconTW.setIcon(epicenterIcon);

	if (!EarthquakeList[data.id].epicenterIconTW.getLatLng().equals([+data.lat + offsetY, +data.lon + offsetX]))
		EarthquakeList[data.id].epicenterIconTW.setLatLng([+data.lat + offsetY, +data.lon + offsetX]);

	if (!Timers.epicenterBlinker)
		Timers.epicenterBlinker = setInterval(() => {
			const epicenter_blink_state = EarthquakeList[Object.keys(EarthquakeList)[0]]?.epicenterIconTW?.getElement()?.classList?.contains("hide");

			if (epicenter_blink_state != undefined)
				for (const key in EarthquakeList) {
					const el = EarthquakeList[key];

					// if (epicenter_blink_state) {
					// 	if (el.epicenterIcon.getElement().classList.contains("hide"))
					// 		el.epicenterIcon.getElement().classList.remove("hide");
					// } else if (!el.epicenterIcon.getElement().classList.contains("hide")) {
					// 	el.epicenterIcon.getElement().classList.add("hide");
					// }

					if (key == INFO[TINFO].ID) {
						if (epicenter_blink_state) {
							if (el.epicenterIconTW.getElement().classList.contains("hide"))
								el.epicenterIconTW.getElement().classList.remove("hide");
						} else if (!el.epicenterIconTW.getElement().classList.contains("hide")) {
							el.epicenterIconTW.getElement().classList.add("hide");
						}
					} else if (!el.epicenterIconTW.getElement()?.classList?.contains("hide")) {
						el.epicenterIconTW.getElement().classList.add("hide");
					}
				}
		}, 500);

	// #endregion <- Epicenter Cross Icon


	if (NOW().getTime() - EEWshot > 60000)
		EEWshotC = 1;

	if (NOW().getTime() - EEWshot > 30000 && EEWshotC <= 2) {
		EEWshotC++;
		EEWshot = NOW().getTime();
		setTimeout(() => {
			ipcRenderer.send("screenshotEEW", {
				Function : data.Function,
				ID       : data.id,
				Version  : data.Version,
				Time     : NOW().getTime(),
				Shot     : EEWshotC,
			});
		}, 300);
	}

	if (data.cancel) {
		if (Canceltime == 0) Canceltime = NOW().getTime();

		if (NOW().getTime() - Canceltime > 5_000) Cancel = true;
	}

	if (NOW().getTime() - data.timestamp > 240_000 || Cancel) {
		TREM.Earthquake.emit("eewEnd", data.id, data.type);
		// TREM.MapIntensity.clear();

		// remove epicenter cross icons
		EarthquakeList[data.id].epicenterIcon.remove();
		EarthquakeList[data.id].epicenterIconTW.remove();

		for (let index = 0; index < INFO.length; index++)
			if (INFO[index].ID == data.id) {
				TINFO = 0;
				INFO.splice(index, 1);
				break;
			}

		if (TREM.EEW.get(data.id)?.geojson) {
			TREM.EEW.get(data.id).geojson.remove();
			delete TREM.EEW.get(data.id).geojson;
		}

		clearInterval(EarthquakeList[data.id].Timer);
		document.getElementById("box-10").innerHTML = "";

		// if (EarthquakeList[data.id].Depth != null) Maps.main.removeLayer(EarthquakeList[data.id].Depth);
		delete EarthquakeList[data.id];

		if (Object.keys(EarthquakeList).length == 0) {
			for (let index = 0, keys = Object.keys(eew), n = keys.length; index < n; index++)
				clearInterval(eew[keys[index]].t);
			audio.main = [];
			arrive = "";
			audio.minor = [];
			eew = {};
			EEWAlert = false;
			// hide eew alert
			Timers.ticker = null;
			Cancel = false;
			Canceltime = 0;

			if (replay != 0) {
				replay = 0;
				Report = 0;
				ipcMain.emit("ReportGET");
			}

			INFO = [];
			Info = { Notify: [], Warn: [], Focus: [] };
			$("#alert-box").removeClass("show");
			$("#map-legends").removeClass("show");
			// hide minimap
			$("#map-tw").removeClass("show");
			// restore reports
			$(roll).fadeIn(200);
			rts_remove_eew = false;
			clearInterval(Timers.epicenterBlinker);
			delete Timers.epicenterBlinker;
			clearInterval(Timers.eew);
			Timers.eew = null;
			rts_remove_eew = false;

			stopReplay();
		}
	}
}

function tsunami_color(color) {
	return (color == "大於6公尺") ? "#B131FF" : (color == "3至6公尺") ? "red" : (color == "1至3公尺") ? "#FFEF29" : "#5CEE18";
}

function tsunami_color_int(color) {
	return (color == "大於6公尺") ? 3 : (color == "3至6公尺") ? 2 : (color == "1至3公尺") ? 1 : 0;
}

function clear(ID, type) {
	if (type != "trem-eew") {
		if (EarthquakeList[ID].CircleS != undefined) EarthquakeList[ID].CircleS = EarthquakeList[ID].CircleS.remove();

		if (EarthquakeList[ID].CircleP != undefined) EarthquakeList[ID].CircleP = EarthquakeList[ID].CircleP.remove();

		if (EarthquakeList[ID].CircleSTW != undefined) Maps.mini.removeLayer(EarthquakeList[ID].CircleSTW);

		if (EarthquakeList[ID].CirclePTW != undefined) Maps.mini.removeLayer(EarthquakeList[ID].CirclePTW);
	}
}

function updateText() {
	$("#alert-box")[0].className = `${INFO[TINFO].alert_type} ${IntensityToClassString(INFO[TINFO].alert_intensity)}`;
	$("#alert-local")[0].className = `alert-item ${IntensityToClassString(INFO[TINFO].alert_local)}`;
	$("#alert-provider").text(`${INFO.length > 1 ? `${TINFO + 1} ` : ""}${INFO[TINFO].alert_provider}`);
	$("#alert-number").text(`${INFO[TINFO].alert_number}`);
	$("#alert-location").text(INFO[TINFO].alert_location);
	$("#alert-time").text(timeconvert(INFO[TINFO].alert_time).format("YYYY/MM/DD HH:mm:ss"));
	$("#alert-magnitude").text(INFO[TINFO].alert_magnitude);
	$("#alert-depth").text(INFO[TINFO].alert_depth);
	$("#alert-box").addClass("show");
	$("#map-legends").addClass("show");

	if (TREM.EEW.get(INFO[TINFO].ID).Cancel != undefined) {
		$("#alert-p").text("X");
		$("#alert-s").text("X");
	} else if (INFO[TINFO].alert_sTime == null) {
		$("#alert-p").text("?");
		$("#alert-s").text("?");
	} else {
		let num = Math.floor((INFO[TINFO].alert_sTime - NOW().getTime()) / 1000);

		if (num <= 0) num = "";
		$("#alert-s").text(num);

		num = Math.floor((INFO[TINFO].alert_pTime - NOW().getTime()) / 1000);

		if (num <= 0) num = "";
		$("#alert-p").text(num);
	}

	// bring waves to front
	// if (EarthquakeList[INFO[TINFO].ID].CircleP) EarthquakeList[INFO[TINFO].ID].CircleP.bringToFront();
	// if (EarthquakeList[INFO[TINFO].ID].CircleS) EarthquakeList[INFO[TINFO].ID].CircleS.bringToFront();

	for (const key in EarthquakeList) {
		if (!TREM.EEW.get(key)?.epicenterIconTW?.getElement()?.classList?.contains("hide"))
			TREM.EEW.get(key)?.epicenterIconTW?.getElement()?.classList?.add("hide");

		if (!TREM.EEW.get(key)?.CirclePTW?.getElement()?.classList?.contains("hide"))
			TREM.EEW.get(key)?.CirclePTW?.getElement()?.classList?.add("hide");

		if (!TREM.EEW.get(key)?.CircleSTW?.getElement()?.classList?.contains("hide"))
			TREM.EEW.get(key)?.CircleSTW?.getElement()?.classList?.add("hide");

		if (TREM.EEW.get(key)?.geojson)
			TREM.EEW.get(key).geojson.remove();
	}

	if (TREM.EEW.get(INFO[TINFO].ID).epicenterIconTW) TREM.EEW.get(INFO[TINFO].ID).epicenterIconTW.getElement()?.classList?.remove("hide");

	if (TREM.EEW.get(INFO[TINFO].ID).CirclePTW) TREM.EEW.get(INFO[TINFO].ID).CirclePTW.getElement()?.classList?.remove("hide");

	if (TREM.EEW.get(INFO[TINFO].ID).CircleSTW) TREM.EEW.get(INFO[TINFO].ID).CircleSTW.getElement()?.classList?.remove("hide");

	if (TREM.EEW.get(INFO[TINFO].ID)?.geojson) TREM.EEW.get(INFO[TINFO].ID).geojson.addTo(Maps.mini);

	const Num = Math.round(((NOW().getTime() - INFO[TINFO].Time) * 4 / 10) / INFO[TINFO].Depth);
	const Catch = document.getElementById("box-10");

	if (Num <= 100)
		Catch.innerHTML = `<font color="white" size="6"><b>震波到地表進度: ${Num}%</b></font>`;
	else
		Catch.innerHTML = "";
}

const changeView = (args, el, event) => {
	if (event instanceof KeyboardEvent && event?.key !== "Enter" && event?.key !== " ")
		return;

	const currentel = $(".view.show");
	const changeel = $(`#${args}`);

	if (changeel.attr("id") == currentel.attr("id")) return;

	const currentnav = $(".active");
	currentnav.removeClass("active");
	$(el)?.addClass("active");

	currentel.removeClass("show");
	changeel.addClass("show");

	if (changeel.attr("id") == "report") {
		TREM.Report.api_key_verify = api_key_verify;
		TREM.Report.report_trem = setting["report.trem"];
		TREM.Report.station = station;
		toggleNav(false);
	}

	if (changeel.attr("id") == "intensity")
		toggleNav(false);

	if (changeel.attr("id") == "main") {
		TREM.Report.setView("report-list");
		toggleNav(false);
	}

	TREM.emit("viewChange", currentel.attr("id"), changeel.attr("id"));
};

function pointFormatter(lat, lng, engine) {
	if (engine == "mapbox-gl")
		return [lng, lat];
	else if (engine == "leaflet")
		return [lat, lng];
}

function NOW() {
	return new Date(ServerTime + (Date.now() - ServerT));
}

function timeconvert(time) {
	return new Date(time.toLocaleString("en-US", { timeZone: "Asia/Taipei" }));
}

function globalgc() {
	global.gc();
}