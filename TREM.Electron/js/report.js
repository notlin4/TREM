/* global maplibregl:false, Maps: false, IntensityToClassString: false, Maps.report: true, IntensityI: false, changeView: false, replay: true, replayT: true */

TREM.Report = {
	cache               : new Map(),
	view                : "report-list",
	reportList          : [],
	reportListElement   : document.getElementById("report-list-container"),
	lock                : false,
	clock               : null,
	api_key_verify      : false,
	station             : {},
	report_trem         : false,
	report_trem_station : {},
	report_trem_data    : [],
	report_station      : {},
	epicenterIcon       : null,

	/**
	 * @type {maplibregl.Marker[]}
	 */
	_markersTREM          : [],
	_markers              : [],
	_markersGroup         : null,
	_lastFocus            : [],
	_filterHasReplay      : false,
	_filterHasNumber      : false,
	_filterMagnitude      : false,
	_filterMagnitudeValue : 5,
	_filterIntensity      : false,
	_filterIntensityValue : 4,
	_filterTREM           : false,
	_filterCWB            : true,
	_filterDate           : false,
	_filterDateValue      : "",
	_filterMonth          : false,
	_filterMonthValue     : "",
	_reportItemTemplate   : document.getElementById("template-report-list-item"),
	_report_trem_data     : storage.getItem("report_trem_data") ?? [],
	_report_Temp          : null,
	get _mapPaddingLeft() {
		return document.getElementById("map-report").offsetWidth / 2;
	},
	unloadReports(skipCheck = false) {
		if (this.view == "report-list" || skipCheck) {
			this.reportListElement.replaceChildren();
			this._clearMap();
		}
	},
	loadReports(skipCheck = false) {
		if (this.view == "report-list" || skipCheck) {
			const fragment = new DocumentFragment();
			const reports = Array.from(this.cache, ([k, v]) => v);
			this.reportList = reports
				.filter(v => this._filterHasNumber ? v.earthquakeNo % 1000 != 0 : true)
				.filter(v => this._filterHasReplay ? v.ID?.length : true)
				.filter(v => this._filterMagnitude ? this._filterMagnitudeValue == -1 ? v.magnitudeValue == 0.0 : this._filterMagnitudeValue == 0 ? v.magnitudeValue < 1.0 : this._filterMagnitudeValue == 1 ? v.magnitudeValue < 2.0 : this._filterMagnitudeValue == 2 ? v.magnitudeValue < 3.0 : this._filterMagnitudeValue == 3 ? v.magnitudeValue < 4.0 : this._filterMagnitudeValue == 45 ? v.magnitudeValue < 4.5 : v.magnitudeValue >= 4.5 : true)
				.filter(v => this._filterIntensity ? v.data[0]?.areaIntensity == this._filterIntensityValue : true)
				.filter(v => this._filterTREM ? v.location.startsWith("地震資訊") : true)
				.filter(v => this._filterCWB ? v.identifier.startsWith("CWB") : true)
				.filter(v => this._filterDate ? v.originTime.split(" ")[0] == this._filterDateValue : true)
				.filter(v => this._filterMonth ? (v.originTime.split(" ")[0].split("/")[0] + "/" + v.originTime.split(" ")[0].split("/")[1]) == this._filterMonthValue : true);

			for (const report of reports) {
				// if (setting["api.key"] == "" && report.data[0].areaIntensity == 0) continue;
				const element = this._createReportItem(report);

				if (
					(this._filterHasNumber && !(report.earthquakeNo % 1000))
					|| (this._filterHasReplay && !(report.ID?.length))
					|| (this._filterMagnitude && !(this._filterMagnitudeValue == -1 ? report.magnitudeValue == 0.0 : this._filterMagnitudeValue == 0 ? report.magnitudeValue < 1.0 : this._filterMagnitudeValue == 1 ? report.magnitudeValue < 2.0 : this._filterMagnitudeValue == 2 ? report.magnitudeValue < 3.0 : this._filterMagnitudeValue == 3 ? report.magnitudeValue < 4.0 : this._filterMagnitudeValue == 45 ? report.magnitudeValue < 4.5 : report.magnitudeValue >= 4.5))
					|| (this._filterIntensity && !(report.data[0]?.areaIntensity == this._filterIntensityValue))
					|| (this._filterTREM && !(report.location.startsWith("地震資訊")))
					|| (this._filterCWB && !(report.identifier.startsWith("CWB")))
					|| (this._filterDate && !(report.originTime.split(" ")[0] == this._filterDateValue))
					|| (this._filterMonth && !((report.originTime.split(" ")[0].split("/")[0] + "/" + report.originTime.split(" ")[0].split("/")[1]) == this._filterMonthValue))) {
					element.classList.add("hide");
					element.style.display = "none";
				} else if (TREM.Detector.webgl || TREM.MapRenderingEngine == "mapbox-gl") {
					const marker = new maplibregl.Marker({
						element: $(TREM.Resources.icon.cross(
							{
								size         : report.magnitudeValue * 4,
								className    : `epicenterIcon clickable raise-on-hover ${IntensityToClassString(report.data[0]?.areaIntensity)}`,
								opacity      : (reports.length - reports.indexOf(report)) / reports.length,
								zIndexOffset : 1000 + reports.length - reports.indexOf(report),
							}))[0],
					}).setLngLat([report.epicenterLon, report.epicenterLat]).addTo(Maps.report);
					marker.getElement().addEventListener("click", () => {
						TREM.set_report_overview = 0;
						this.setView("report-overview", report.identifier);
					});
					this._markers.push(marker);
				} else if (!TREM.Detector.webgl || TREM.MapRenderingEngine == "leaflet") {
					this._markers.push(L.marker(
						[report.epicenterLat, report.epicenterLon],
						{
							icon: L.divIcon({
								html      : TREM.Resources.icon.oldcross,
								iconSize  : [report.magnitudeValue * 4, report.magnitudeValue * 4],
								className : `epicenterIcon ${IntensityToClassString(report.data[0]?.areaIntensity)}`,
							}),
							opacity      : (reports.length - reports.indexOf(report)) / reports.length,
							zIndexOffset : 1000 + reports.length - reports.indexOf(report),
						})
						.on("click", () => {
							TREM.set_report_overview = 0;
							this.setView("report-overview", report.identifier);
						}));
					this._markersGroup = L.featureGroup(this._markers).addTo(Maps.report);
				}

				fragment.appendChild(element);
			}

			this.reportListElement.appendChild(fragment);
		}
	},
	_createReportItem(report) {
		const el = document.importNode(this._reportItemTemplate.content, true).querySelector(".report-list-item");
		el.id = report.identifier;
		el.className += ` ${IntensityToClassString(report.data[0]?.areaIntensity)}`;
		el.querySelector(".report-list-item-location").innerText = report.location;
		el.querySelector(".report-list-item-id").innerText = TREM.Localization.getString(report.location.startsWith("地震資訊") ? "Report_Title_Local" : (report.earthquakeNo % 1000 ? report.earthquakeNo : "Report_Title_Small"));
		el.querySelector(".report-list-item-Magnitude").innerText = report.magnitudeValue == 0 ? "0.0" : report.magnitudeValue;
		el.querySelector(".report-list-item-time").innerText = report.originTime.replace(/-/g, "/");

		el.querySelector("button").value = report.identifier;
		el.querySelector("button").addEventListener("click", function() {
			TREM.Report.setView("report-overview", this.value);
		});
		ripple(el.querySelector("button"));

		return el;
	},

	/**
	 * @param {*} key
	 * @param {*} value
	 * @param {HTMLSelectElement} select
	 */
	_handleFilter(key, value, select) {
		const oldlist = [...this.reportList];
		this[`_${key}`] = value;

		if (key == "filterTREM" && value) {
			const element = document.getElementById("report-label-filter-hasNumber");
			element.classList.add("hide");
			element.style.display = "none";
			const element1 = document.getElementById("report-label-filter-intensity");
			element1.classList.add("hide");
			element1.style.display = "none";
			const element2 = document.getElementById("report-label-filter-CWB");
			element2.classList.add("hide");
			element2.style.display = "none";
			this._filterHasNumber = false;
			this._filterIntensity = false;
			this._filterCWB = false;
		} else if (key == "filterTREM" && !value) {
			const element = document.getElementById("report-label-filter-hasNumber");
			element.classList.remove("hide");
			element.style.display = "block";
			const element1 = document.getElementById("report-label-filter-intensity");
			element1.classList.remove("hide");
			element1.style.display = "block";
			const element2 = document.getElementById("report-label-filter-CWB");
			element2.classList.remove("hide");
			element2.style.display = "block";
			this._filterCWB = true;
			const element3 = document.getElementById("report-filter-CWB");
			element3.checked = true;
			const element5 = document.getElementById("report-filter-hasNumber");
			element5.checked = false;
			const element6 = document.getElementById("report-filter-intensity");
			element6.checked = false;
		}

		if (select) {
			const parent = document.getElementById(select.id.slice(0, select.id.length - 6));

			if (!parent.checked)
				return parent.click();
		}

		this._filterDateValue = this._filterDateValue.replace(/-/g, "/");
		this._filterMonthValue = this._filterMonthValue.replace(/-/g, "/");

		this.reportList = Array.from(this.cache, ([k, v]) => v)
			.filter(v => this._filterHasNumber ? v.earthquakeNo % 1000 != 0 : true)
			.filter(v => this._filterHasReplay ? v.ID?.length : true)
			.filter(v => this._filterMagnitude ? this._filterMagnitudeValue == -1 ? v.magnitudeValue == 0.0 : this._filterMagnitudeValue == 0 ? v.magnitudeValue < 1.0 : this._filterMagnitudeValue == 1 ? v.magnitudeValue < 2.0 : this._filterMagnitudeValue == 2 ? v.magnitudeValue < 3.0 : this._filterMagnitudeValue == 3 ? v.magnitudeValue < 4.0 : this._filterMagnitudeValue == 45 ? v.magnitudeValue < 4.5 : v.magnitudeValue >= 4.5 : true)
			.filter(v => this._filterIntensity ? v.data[0]?.areaIntensity == this._filterIntensityValue : true)
			.filter(v => this._filterTREM ? v.location.startsWith("地震資訊") : true)
			.filter(v => this._filterCWB ? v.identifier.startsWith("CWB") : true)
			.filter(v => this._filterDate ? v.originTime.split(" ")[0] == this._filterDateValue : true)
			.filter(v => this._filterMonth ? (v.originTime.split(" ")[0].split("/")[0] + "/" + v.originTime.split(" ")[0].split("/")[1]) == this._filterMonthValue : true);

		this._updateReports(oldlist, this.reportList);
	},
	setView(view, reportIdentifier) {
		if (this.view == view)
			if (!reportIdentifier)
				return;

		const oldView = document.getElementById(this.view);
		let newView = document.getElementById(view);

		document.getElementById("report-detail-body").style.height = `${oldView.offsetHeight + 16 }px`;
		document.getElementById("report-detail-body").style.width = `${oldView.offsetWidth + 16 }px`;

		switch (view) {
			case "report-list": {
				this._clearMap(true);
				this.loadReports(true);
				document.getElementById("report-detail-back").classList.add("hide");
				document.getElementById("report-detail-refresh").classList.remove("hide");
				break;
			}

			case "report-overview": {
				if (this.view == "report-list") this.unloadReports(true);
				this._setupReport(this.cache.get(reportIdentifier));
				document.getElementById("report-detail-back").classList.remove("hide");
				document.getElementById("report-detail-refresh").classList.add("hide");
				break;
			}

			case "eq-report-overview": {
				if (this.view == "report-list") this.unloadReports(true);
				this._setupReport(reportIdentifier);
				document.getElementById("report-detail-back").classList.remove("hide");
				document.getElementById("report-detail-refresh").classList.add("hide");
				break;
			}

			default:
				break;
		}

		if (view == "eq-report-overview") {
			view = "report-overview";
			newView = document.getElementById(view);
		}

		if (this.view != view) {
			oldView.classList.remove("show");
			newView.style.position = "absolute";
			newView.style.visibility = "visible";
			document.getElementById("report-detail-body").style.height = `${newView.offsetHeight + 16 }px`;
			document.getElementById("report-detail-body").style.width = `${newView.offsetWidth + 16 }px`;
			setTimeout(() => {
				oldView.style.visibility = "hidden";
				newView.classList.add("show");
			}, 250);
		}

		setTimeout(() => {
			newView.style.position = "";
			document.getElementById("report-detail-body").style.height = "";
			document.getElementById("report-detail-body").style.width = "";
		}, 500);

		this.view = view;
	},
	replay(id) {
		const report = this.cache.get(id);

		if (replay != 0) return;
		changeView("main", "#mainView_btn");

		let list = [];

		if (report.download) {
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
	},
	replaydownloader(id) {
		const report = this.cache.get(id);
		console.log(report);

		let time = new Date(report.originTime.replace(/-/g, "/")).getTime() - 25000;
		const time_hold = time;
		const _end_time = time + 205000;

		const downloader_progress = document.getElementById("downloader_progress");
		const progressStep = 206;
		let progresstemp = 0;

		if (!fs.existsSync("./replay_data")) fs.mkdirSync("./replay_data");

		if (this.lock) return;

		if (!report.download) {
			document.getElementById("report-replay-downloader-text").innerHTML = "下載中...";
			this.clock = setInterval(() => {
				if (time > _end_time) {
					clearInterval(this.clock);
					console.log("Finish!");
					document.getElementById("report-replay-downloader-icon").innerHTML = "download_done";
					document.getElementById("report-replay-downloader-text").innerHTML = "下載完成!";
					downloader_progress.style.display = "none";
					report.download = true;
					this.cache.set(report.identifier, report);
					this.lock = false;
					return;
				}

				if (report.download) return;

				this.lock = true;
				fetch(`https://exptech.com.tw/api/v2/trem/rts?time=${time}`)
					.then(res => res.json())
					.then(res => {
						if (!fs.existsSync(`./replay_data/${time_hold}`)) fs.mkdirSync(`./replay_data/${time_hold}`);
						fs.access(`./replay_data/${time_hold}/${time}.json`, (err) => {
							if (!err) {
								clearInterval(this.clock);
								console.log("Finish!(is found it)");
								document.getElementById("report-replay-downloader-text").innerHTML = "重複下載!";
								downloader_progress.style.display = "none";
								report.download = true;
								this.cache.set(report.identifier, report);
							} else if (err.code == "ENOENT") {
								fs.writeFile(`./replay_data/${time_hold}/${time}.json`, JSON.stringify(res), () => {
									time += 1000;
								});
								progresstemp += (1 / progressStep) * 1;
								downloader_progress.value = progresstemp;
								downloader_progress.title = `${Math.round(progresstemp * 10000) / 100}%`;
								downloader_progress.style.display = "";
							}
						});
					})
					.catch(err => {
						this.lock = false;
						console.log(err.message);
						log(err, 3, "replaydownloader", "Report");
						dump({ level: 2, message: err });
					});
			}, 500);
		} else {
			downloader_progress.style.display = "none";
			console.log("Finish!(is download)");
		}
	},
	replaydownloaderrm(id) {
		const report = this.cache.get(id);
		const time = new Date(report.originTime.replace(/-/g, "/")).getTime() - 25000;

		fs.rm(`./replay_data/${time}/`, { recursive: true }, () => {
			document.getElementById("report-replay-downloader-icon").innerHTML = "download";
			document.getElementById("report-replay-downloader-text").innerHTML = "下載";
			document.getElementById("downloader_progress").style.display = "none";
			report.download = false;
			this.cache.set(report.identifier, report);

			if (this.lock) {
				this.lock = false;
				clearInterval(this.clock);
			}
		});
	},
	back() {
		if (TREM.set_report_overview != 0)
			TREM.backindexButton();

		switch (this.view) {
			case "report-overview":
				this.setView("report-list");
				break;

			default:
				break;
		}
	},
	refreshList() {
		this.unloadReports();
		this.loadReports();
	},
	copyReport(id) {
		const { clipboard, shell } = require("electron");
		const report = this.cache.get(id);
		const string = [];
		string.push(`　　　　　　　　　　${report.location.startsWith("地震資訊") ? "地震資訊" : "中央氣象局"}地震測報中心　${TREM.Localization.getString(report.location.startsWith("地震資訊") ? "Report_Title_Local" : (report.earthquakeNo % 1000 ? `第${report.earthquakeNo.toString().slice(-3)}號有感地震報告` : "Report_Title_Small"))}`);
		const time = new Date(report.originTime);
		string.push(`　　　　　　　　　　發　震　時　間： ${time.getFullYear() - 1911}年${(time.getMonth() + 1 < 10 ? " " : "") + (time.getMonth() + 1)}月${(time.getDate() < 10 ? " " : "") + time.getDate()}日${(time.getHours() < 10 ? " " : "") + time.getHours()}時${(time.getMinutes() < 10 ? " " : "") + time.getMinutes()}分${(time.getSeconds() < 10 ? " " : "") + time.getSeconds()}秒`);
		string.push(`　　　　　　　　　　震　央　位　置： 北　緯　 ${report.epicenterLat.toFixed(2)} °`);
		string.push(`　　　　　　　　　　　　　　　　　　 東  經　${report.epicenterLon.toFixed(2)} °`);
		string.push(`　　　　　　　　　　震　源　深　度：　 ${report.depth < 10 ? " " : ""}${report.depth.toFixed(1)}  公里`);
		string.push(`　　　　　　　　　　芮　氏　規　模：　  ${report.magnitudeValue.toFixed(1)}`);
		string.push(`　　　　　　　　　　相　對　位　置： ${report.location}`);
		string.push("");
		string.push("                                 各 地 震 度 級");
		string.push("");

		const name = (text) => text.length < 3 ? text.split("").join("　") : text;
		const int = (number) => `${IntensityI(number)}級`.replace("-級", "弱").replace("+級", "強");
		const areas = [];

		for (const areaData of report.data) {
			const areaString = [];
			areaString.push(`${areaData.areaName}地區最大震度 ${int(areaData.areaIntensity)}`);
			for (const stationData of areaData.eqStation)
				areaString.push(`　　　${name(stationData.stationName)} ${int(stationData.stationIntensity)}　　　`);

			areas.push(areaString);
		}

		let count = areas.length;

		if (count > 2)
			while (count > 0) {
				const threeAreas = [
					areas.shift(),
					areas.shift(),
					areas.shift(),
				];
				const whichToLoop = threeAreas[threeAreas.reduce((p, c, i, a) => a[p]?.length > c?.length ? p : i, 0)];
				const theLine = [];

				for (const index in whichToLoop) {
					const a = threeAreas[0][index];
					const b = threeAreas[1][index];
					const c = threeAreas[2][index];
					let strToPush = "";

					if (a)
						strToPush += a;
					else
						strToPush += "　　　　　　　　　　　";

					if (b)
						strToPush += `　　　${b}`;
					else
						strToPush += "　　　　　　　　　　　　　　";

					if (c)
						strToPush += `　　　${c}`;
					else
						strToPush += "　　　　　　　　　　　";
					theLine.push(strToPush.trimEnd());
				}

				string.push(theLine.join("\n"));
				count -= 3;
				continue;
			}
		else
			for (const area of areas) {
				const theLine = [];

				for (const str of area) {
					let strToPush = "";

					if (str)
						strToPush += `　　　　　　　　　　　　　　${str}`;

					theLine.push(strToPush.trimEnd());
				}

				string.push(theLine.join("\n"));
			}

		const filepath = path.join(app.getPath("temp"), `TREM_Report_${id}.txt`);
		fs.writeFileSync(filepath, string.join("\n"), { encoding: "utf-8" });
		shell.openPath(filepath);
		setTimeout(() => fs.rmSync(filepath), 5_000);
	},

	/**
	 * @param {EarthquakeReport[]} oldlist
	 * @param {EarthquakeReport[]} newlist
	 */
	_updateReports(oldlist, newlist) {
		const removed = oldlist.filter(v => !newlist.includes(v));
		const added = newlist.filter(v => !oldlist.includes(v));
		const keys = [...this.cache.keys()];

		this._clearMap();

		for (const report of removed)
			this._hideItem(document.getElementById(report.identifier));

		for (const report of added)
			this._showItem(document.getElementById(report.identifier));

		for (const report of newlist)
			if (TREM.Detector.webgl || TREM.MapRenderingEngine == "mapbox-gl") {
				const marker = new maplibregl.Marker({
					element: $(TREM.Resources.icon.cross(
						{
							size         : report.magnitudeValue * 4,
							className    : `epicenterIcon clickable raise-on-hover ${IntensityToClassString(report.data[0]?.areaIntensity)}`,
							opacity      : (newlist.length - newlist.indexOf(report)) / newlist.length,
							zIndexOffset : 1000 + this.cache.size - keys.indexOf(report.identifier),
						}))[0],
				}).setLngLat([report.epicenterLon, report.epicenterLat]).addTo(Maps.report);
				marker.getElement().addEventListener("click", () => {
					TREM.set_report_overview = 0;
					this.setView("report-overview", report.identifier);
				});
				this._markers.push(marker);
			} else if (!TREM.Detector.webgl || TREM.MapRenderingEngine == "leaflet") {
				this._markers.push(L.marker(
					[report.epicenterLat, report.epicenterLon],
					{
						icon: L.divIcon({
							html      : TREM.Resources.icon.oldcross,
							iconSize  : [report.magnitudeValue * 4, report.magnitudeValue * 4],
							className : `epicenterIcon ${IntensityToClassString(report.data[0]?.areaIntensity)}`,
						}),
						opacity      : (newlist.length - newlist.indexOf(report)) / newlist.length,
						zIndexOffset : 1000 + this.cache.size - keys.indexOf(report.identifier),
					})
					.on("click", () => {
						TREM.set_report_overview = 0;
						this.setView("report-overview", report.identifier);
					}));
				this._markersGroup = L.featureGroup(this._markers).addTo(Maps.report);
			}
	},

	/**
	 * @param {HTMLElement} element
	 */
	_hideItem(element) {
		element.classList.add("hide");
		setTimeout(() => element.style.display = "none", 200);
	},

	/**
	 * @param {HTMLElement} element
	 * @param {HTMLElement} reference
	 */
	_showItem(element) {
		element.style.display = "";
		setTimeout(() => element.classList.remove("hide"), 10);
	},
	_focusMap(...args) {
		if (args.length) {
			this._lastFocus = [...args];
			Maps.report.fitBounds(...args);
		} else if (this._lastFocus.length) {
			Maps.report.fitBounds(...this._lastFocus);
		} else if (TREM.Detector.webgl || TREM.MapRenderingEngine == "mapbox-gl") {
			this._lastFocus = [
				[
					119.8,
					21.82,
					122.18,
					25.42,
				],
				{
					padding  : { left: (Maps.report.getCanvas().width / 2) * 0.8 },
					duration : 1000,
				},
			];
			Maps.report.fitBounds(...this._lastFocus);
		} else if (!TREM.Detector.webgl || TREM.MapRenderingEngine == "leaflet") {
			this._lastFocus = [[[25.35, 119.4], [21.9, 122.22]], { paddingTopLeft: [this._mapPaddingLeft, 0] }];
			Maps.report.fitBounds(...this._lastFocus);
		}
	},
	_clearMap(resetFoucs = false) {
		if (this._markers.length) {
			for (const marker of this._markers)
				marker.remove();
			this._markers = [];
		}

		if (resetFoucs) {
			this._lastFocus = [];
			this._focusMap();
		}
	},

	/**
	 * @param {EarthquakeReport} report
	 */
	_setupReport(report) {
		this._clearMap();

		console.log(report);

		if (!report) return;

		document.getElementById("report-overview-number").innerText = TREM.Localization.getString(report.location.startsWith("地震資訊") ? "Report_Title_Local" : (report.earthquakeNo % 1000 ? report.earthquakeNo : "Report_Title_Small"));
		document.getElementById("report-overview-location").innerText = report.location;
		const time = new Date((new Date(`${report.originTime} GMT+08:00`)).toLocaleString("en-US", { timeZone: "Asia/Taipei" }));
		document.getElementById("report-overview-time").innerText = report.originTime;
		document.getElementById("report-overview-latitude").innerText = report.epicenterLat;
		document.getElementById("report-overview-longitude").innerText = report.epicenterLon;

		if (report.location.startsWith("地震資訊")) {
			document.getElementById("report-overview-intensity").parentElement.parentElement.style.display = "none";
		} else {
			document.getElementById("report-overview-intensity").parentElement.parentElement.style.display = "";
			const int = `${IntensityI(report.data[0]?.areaIntensity)}`.split("");
			document.getElementById("report-overview-intensity").innerText = int[0];
			document.getElementById("report-overview-intensity").className = (int[1] == "+") ? "strong"
				: (int[1] == "-") ? "weak"
					: "";
		}

		document.getElementById("report-overview-intensity-location").innerText = (report.location.startsWith("地震資訊")) ? "" : `${report.data[0].areaName} ${report.data[0].eqStation[0].stationName}`;
		document.getElementById("report-overview-magnitude").innerText = report.magnitudeValue == 0 ? "0.0" : report.magnitudeValue;
		document.getElementById("report-overview-depth").innerText = report.depth;

		// if (report.location.startsWith("地震資訊")) {
		// 	document.getElementById("report-detail-copy").style.display = "none";
		// } else {
		// 	document.getElementById("report-detail-copy").style.display = "";
		// 	document.getElementById("report-detail-copy").value = report.identifier;
		// }
		document.getElementById("report-detail-copy").style.display = "";
		document.getElementById("report-detail-copy").value = report.identifier;

		document.getElementById("report-replay").value = report.identifier;
		document.getElementById("report-replay-downloader").value = report.identifier;

		const timed = new Date(report.originTime.replace(/-/g, "/")).getTime() - 25000;
		const _end_timed = timed + 205000;
		fs.access(`./replay_data/${timed}/${timed}.json`, (err) => {
			if (!err) {
				document.getElementById("report-replay-downloader-icon").innerHTML = "download_done";
				document.getElementById("report-replay-downloader-text").innerHTML = "已下載!";
				report.download = true;
				this.cache.set(report.identifier, report);
				fs.access(`./replay_data/${timed}/${_end_timed}.json`, (err) => {
					if (err) {
						document.getElementById("report-replay-downloader-icon").innerHTML = "download";
						document.getElementById("report-replay-downloader-text").innerHTML = "下載中...";
						report.download = false;
						this.cache.set(report.identifier, report);
					}
				});
			} else {
				document.getElementById("report-replay-downloader-icon").innerHTML = "download";
				document.getElementById("report-replay-downloader-text").innerHTML = "下載";
				report.download = false;
				this.cache.set(report.identifier, report);
			}
		});

		if (report.location.startsWith("地震資訊")) {
			document.getElementById("report-cwb").style.display = "none";
			document.getElementById("report-scweb").style.display = "none";
		} else {
			document.getElementById("report-cwb").style.display = "";
			document.getElementById("report-scweb").style.display = "";

			const cwb_code = "EQ"
				+ report.earthquakeNo
				+ "-"
				+ (time.getMonth() + 1 < 10 ? "0" : "") + (time.getMonth() + 1)
				+ (time.getDate() < 10 ? "0" : "") + time.getDate()
				+ "-"
				+ (time.getHours() < 10 ? "0" : "") + time.getHours()
				+ (time.getMinutes() < 10 ? "0" : "") + time.getMinutes()
				+ (time.getSeconds() < 10 ? "0" : "") + time.getSeconds();
			document.getElementById("report-cwb").value = `https://www.cwb.gov.tw/V8/C/E/EQ/${cwb_code}.html`;

			const scweb_code = ""
				+ time.getFullYear()
				+ (time.getMonth() + 1 < 10 ? "0" : "") + (time.getMonth() + 1)
				+ (time.getDate() < 10 ? "0" : "") + time.getDate()
				+ (time.getHours() < 10 ? "0" : "") + time.getHours()
				+ (time.getMinutes() < 10 ? "0" : "") + time.getMinutes()
				+ (time.getSeconds() < 10 ? "0" : "") + time.getSeconds()
				+ (report.magnitudeValue * 10)
				+ (report.earthquakeNo % 1000 ? report.earthquakeNo.toString().slice(-3) : "");
			document.getElementById("report-scweb").value = `https://scweb.cwb.gov.tw/zh-tw/earthquake/details/${scweb_code}`;
		}

		let Station_i = 0;
		this.report_station = {};

		if (report.data.length)
			for (const data of report.data)
				for (const eqStation of data.eqStation) {
					let station_tooltip = "";

					if (TREM.Detector.webgl || TREM.MapRenderingEngine == "mapbox-gl") {
						station_tooltip = `<div class="marker-popup rt-station-popup rt-station-detail-container"><span>測站地名: ${data.areaName} ${eqStation.stationName}</span><span>距離震央: ${eqStation.distance} km</span><span>震度: ${IntensityI(eqStation.stationIntensity)}</span></div>`;
						const station_tooltip_popup = new maplibregl.Popup({ closeOnClick: false, closeButton: false });
						this.report_station[Station_i] = new maplibregl.Marker({
							element: $(`<div class="map-intensity-icon ${IntensityToClassString(eqStation.stationIntensity)}" style="height:16px;width:16px;z-index:${200 + eqStation.stationIntensity};"></div>`)[0],
						}).setLngLat([eqStation.stationLon, eqStation.stationLat]).setPopup(station_tooltip_popup.setHTML(station_tooltip)).addTo(Maps.report);
						this.report_station[Station_i].getElement().addEventListener("mouseover", () => {
							station_tooltip_popup.setLngLat([eqStation.stationLon, eqStation.stationLat]).setHTML(station_tooltip).addTo(Maps.report);
						});
						this.report_station[Station_i].getElement().addEventListener("mouseleave", () => {
							station_tooltip_popup.remove();
						});
						this._markers.push(
							this.report_station[Station_i],
						);
						Station_i += 1;
					} else if (!TREM.Detector.webgl || TREM.MapRenderingEngine == "leaflet") {
						station_tooltip = `<div>測站地名: ${data.areaName} ${eqStation.stationName}</div><div>距離震央: ${eqStation.distance} km</div><div>震度: ${IntensityI(eqStation.stationIntensity)}</div>`;
						this.report_station[Station_i] = L.marker(
							[eqStation.stationLat, eqStation.stationLon],
							{
								icon: L.divIcon({
									iconSize  : [16, 16],
									className : `map-intensity-icon ${IntensityToClassString(eqStation.stationIntensity)}`,
								}),
								zIndexOffset: 200 + eqStation.stationIntensity,
							}).bindTooltip(station_tooltip, {
							offset    : [8, 0],
							permanent : false,
							className : "report-cursor-tooltip",
						});
						this._markers.push(this.report_station[Station_i]);
						Station_i += 1;
					}
				}

		// console.log(this.report_station);
		this.epicenterIcon = null;

		if (TREM.Detector.webgl || TREM.MapRenderingEngine == "mapbox-gl") {
			this.epicenterIcon = new maplibregl.Marker({
				element: $(TREM.Resources.icon.cross(
					{ size: 32, className: "epicenterIcon", zIndexOffset: 5000 },
				))[0],
			}).setLngLat([report.epicenterLon, report.epicenterLat]).addTo(Maps.report);
			this._markers.push(
				this.epicenterIcon,
			);
		} else if (!TREM.Detector.webgl || TREM.MapRenderingEngine == "leaflet") {
			this.epicenterIcon = L.marker(
				[report.epicenterLat, report.epicenterLon],
				{
					icon: L.divIcon({
						html      : TREM.Resources.icon.oldcross,
						iconSize  : [32, 32],
						className : "epicenterIcon",
					}),
					zIndexOffset: 5000,
				});
			this._markers.push(this.epicenterIcon);
		}

		this.report_trem_data = this._report_trem_data;
		this._report_Temp = report;
		this._setuptremget(report);
	},
	_setuptremget(report) {
		if (this.report_trem)
			if (report.trem.length != 0)
				if (!this.report_trem_data[report.trem[0]])
					fetch(`https://exptech.com.tw/api/v1/file?path=/trem_report/${report.trem[0]}.json`)
						.then(res => res.json())
						.then(res => {
							this._report_trem_data[report.trem[0]] = res;
							this.report_trem_data[report.trem[0]] = this._report_trem_data[report.trem[0]];
							storage.setItem("report_trem_data", this._report_trem_data);
							this._setuptremmarker(report);
						})
						.catch(err => {
							console.log(err.message);
							log(err, 3, "report_trem", "Report");
							dump({ level: 2, message: err });
						});
				else
					this._setuptremmarker(report);
			else
				this._setupzoomPredict();
		else
			this._setupzoomPredict();
	},
	_setuptremmarker(report) {
		this.report_trem_station = {};

		if (this.report_trem_data[report.trem[0]])
			if (TREM.Detector.webgl || TREM.MapRenderingEngine == "mapbox-gl") {
				let Station_i0 = 0;
				const res = this.report_trem_data[report.trem[0]];

				for (let index0 = 0; index0 < res.station.length; index0++) {
					const info = res.station[index0];

					for (let index = 0, keys = Object.keys(this.station), n = keys.length; index < n; index++) {
						const uuid = keys[index];

						if (info.uuid == uuid) {
							const station_deta = this.station[uuid];
							const latlng = L.latLng(station_deta.Lat, station_deta.Long);
							const latlng1 = L.latLng(report.epicenterLat, report.epicenterLon);
							const distance = latlng.distanceTo(latlng1);
							const station_markers_tooltip = `<div class="marker-popup rt-station-popup rt-station-detail-container"><span>UUID: ${uuid}</span><span>鄉鎮: ${station_deta.Loc}</span><span>PGA: ${info.pga} gal</span><span>PGV: ${info.pgv} kine</span><span>震度: ${IntensityI(info.intensity)}</span><span>距離震央: ${(distance / 1000).toFixed(2)} km</span></div>`;
							const station_tooltip_popup = new maplibregl.Popup({ closeOnClick: false, closeButton: false });
							this.report_trem_station[Station_i0] = new maplibregl.Marker({
								element: $(`<div class="map-intensity-icon ${info.intensity != 0 ? "pga" : ""} ${IntensityToClassString(info.intensity)}" style="height:16px;width:16px;z-index:${100 + info.intensity};"></div>`)[0],
							}).setLngLat([uuid.startsWith("H") ? station_deta.Long + 0.005 : station_deta.Long, station_deta.Lat]).setPopup(station_tooltip_popup.setHTML(station_markers_tooltip));
							this.report_trem_station[Station_i0].getElement().addEventListener("mouseover", () => {
								station_tooltip_popup.setLngLat([uuid.startsWith("H") ? station_deta.Long + 0.005 : station_deta.Long, station_deta.Lat]).setHTML(station_markers_tooltip).addTo(Maps.report);
							});
							this.report_trem_station[Station_i0].getElement().addEventListener("mouseleave", () => {
								station_tooltip_popup.remove();
							});

							this.report_trem_station[Station_i0].addTo(Maps.report);
							this._markers.push(this.report_trem_station[Station_i0]);
							this._setupzoomPredict();
							Station_i0 += 1;
						}
					}
				}

				this._setupzoomPredict();
			} else if (!TREM.Detector.webgl || TREM.MapRenderingEngine == "leaflet") {
				let Station_i0 = 0;
				const res = this.report_trem_data[report.trem[0]];

				for (let index0 = 0; index0 < res.station.length; index0++) {
					const info = res.station[index0];

					for (let index = 0, keys = Object.keys(this.station), n = keys.length; index < n; index++) {
						const uuid = keys[index];

						if (info.uuid == uuid) {
							const station_deta = this.station[uuid];
							const latlng = L.latLng(station_deta.Lat, station_deta.Long);
							const latlng1 = L.latLng(report.epicenterLat, report.epicenterLon);
							const distance = latlng.distanceTo(latlng1);
							const station_markers_tooltip = `<div>UUID: ${uuid}</div><div>鄉鎮: ${station_deta.Loc}</div><div>PGA: ${info.pga} gal</div><div>PGV: ${info.pgv} kine</div><div>震度: ${IntensityI(info.intensity)}</div><div>距離震央: ${(distance / 1000).toFixed(2)} km</div>`;
							this.report_trem_station[Station_i0] = L.marker(
								[station_deta.Lat, uuid.startsWith("H") ? station_deta.Long + 0.005 : station_deta.Long],
								{
									icon: L.divIcon({
										iconSize  : [16, 16],
										className : `map-intensity-icon rt-icon trem ${info.intensity != 0 ? "pga" : ""} ${IntensityToClassString(info.intensity)}`,
									}),
									keyboard     : false,
									zIndexOffset : 100 + info.intensity,
								}).bindTooltip(station_markers_tooltip, {
								offset    : [8, 0],
								permanent : false,
								className : "report-cursor-tooltip",
							});

							this._markers.push(this.report_trem_station[Station_i0]);
							this._setupzoomPredict();
							Station_i0 += 1;
						}
					}
				}
			}
		// console.log(this.report_trem_station);
	},
	_setupzoomPredict() {
		if (TREM.Detector.webgl || TREM.MapRenderingEngine == "mapbox-gl") {
			const bounds = new maplibregl.LngLatBounds();

			for (const marker of this._markers)
				bounds.extend(marker.getLngLat());

			const camera = Maps.report.cameraForBounds(bounds);
			const zoomPredict = (1 / (Maps.report.getMaxZoom() * (camera.zoom ** ((2 * Maps.report.getMaxZoom() - (Maps.report.getMinZoom() + camera.zoom)) / camera.zoom)))) * (camera.zoom - Maps.report.getMinZoom());
			const canvasHeight = Maps.report.getCanvas().height;
			const canvasWidth = Maps.report.getCanvas().width;
			const focusCam = Maps.report.cameraForBounds(bounds, {
				padding: {
					top    : canvasHeight * zoomPredict,
					left   : document.getElementById("report-overview").offsetWidth + 40,
					bottom : canvasHeight * zoomPredict,
					right  : canvasWidth * zoomPredict,
				},
			});
			this._focusMap(bounds, {
				zoom    : focusCam.zoom * (this._markers.length > 1 ? 0.975 : 0.8),
				padding : {
					left: document.getElementById("report-overview").offsetWidth + canvasWidth * zoomPredict,
				},
				duration: 1000,
			});
		} else if (!TREM.Detector.webgl || TREM.MapRenderingEngine == "leaflet") {
			this._markersGroup = L.featureGroup(this._markers).addTo(Maps.report);

			const zoomPredict = (Maps.report.getBoundsZoom(this._markersGroup.getBounds()) - Maps.report.getMinZoom()) / (Maps.report.getMaxZoom() * (1.5 ** (Maps.report.getBoundsZoom(this._markersGroup.getBounds()) - Maps.report.getMinZoom())));
			const offsetHeightPredict = (document.getElementById("map-report").offsetHeight * zoomPredict) + 50;
			this._focusMap(this._markersGroup.getBounds(), {
				paddingTopLeft     : [document.getElementById("map-report").offsetWidth / 2, offsetHeightPredict],
				paddingBottomRight : [document.getElementById("map-report").offsetWidth * zoomPredict, offsetHeightPredict],
			});
		}
	},
	_setup_api_key_verify() {
		if (!this.api_key_verify) {
			const element = document.getElementById("report-label-filter-TREM");
			element.classList.add("hide");
			element.style.display = "none";
		} else if (this.api_key_verify) {
			const element = document.getElementById("report-label-filter-TREM");
			element.classList.remove("hide");
			element.style.display = "block";
		}
	},
};

TREM.on("viewChange", (oldView, newView) => {
	switch (oldView) {
		case "report": {
			TREM.Report.unloadReports();
			TREM.Report._setup_api_key_verify();
			break;
		}

		default:
			break;
	}

	switch (newView) {
		case "report": {
			TREM.Report.loadReports();
			TREM.Report._focusMap();
			TREM.Report._setup_api_key_verify();
			break;
		}

		default:
			break;
	}
});