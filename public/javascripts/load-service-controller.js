/*global define */

'use strict';

require([ 'angular', './load-service-dao'], function() {

	var controllers = angular.module('loadService.load-service-controller',
			[ 'loadService.load-service-dao' ]);

	controllers.controller('loadServiceCtrl', [ '$scope', 'loadServiceDao','$q','$timeout','toastr',
			function($scope, loadServiceDao, $q, $timeout, toastr) {
				var maxNumberOfStatistics = 100;
		
				var websocket = new WebSocket(getWsAddress());
				websocket.onmessage = handleWebsocketMessage

				$scope.newLoadResource = newLoadResource; 
				$scope.createLoadResource = createLoadResource;
				$scope.saveLoadResource = saveLoadResource;
				$scope.deleteLoadResource= deleteLoadResource;
				$scope.startSession = startSession;
				$scope.stopSession = stopSession;
				$scope.showInfo = showInfo;
				
				$scope.notImplemented = function() {
					window.alert("Sorry, this function is not implemented yet.");
				};
				

				
				
				$scope.failedChartOptions = {
						series: {shadowSize: 0},
						xaxis: {
							show: false
						},	
						legend: { position: "nw"}
					}
				
				$scope.sucessfulChartOptions = {
						series: {shadowSize: 0},
						xaxis: {
							show: false
						},
						legend: { position: "nw"},
						yaxes: [ { min: 0 }, {
							min:0,
							alignTicksWithAxis: 1,
							position: 1,
							tickFormatter: function (v, axis) {
								return v.toFixed(axis.tickDecimals) + "ms";
							}
						}]
					};				
				

		
				activate();
				
				function activate() {
					listLoadResources();
				}
				
				function getResource(id) {
					return $scope.loadResourceList.find(function(r) {
						return r.id === id;
					});
				}
				
				function getCurrentSide(id) {
					if($scope.loadResourceList && getResource(id)) {
						return current.currentSide;
					} else {
						return "flippable_front";
					}
					
				}
				
				function getCurrentPlotData(id) {
					if($scope.loadResourceList && getResource(id)) {
						return current.plotData;
					} else {
						return {};
					}
				}
				
				function backDisplayed(r) {
					return r.currentSide === "flippable_back";
				}
				
				function toLoadResource(loadSpec) {
					console.log(loadSpec);
					return {
						create: false,
						id: loadSpec.id,
						method: loadSpec.method,
						url: loadSpec.url,
						body: loadSpec.body,	
						status: loadSpec.status,
						numberOfRequestPerSecond: loadSpec.numberOfRequestPerSecond,
						maxTimeForRequestInMillis: loadSpec.maxTimeForRequestInMillis,
						expectedResponseCode: loadSpec.expectedResponseCode,
						expectedBody: loadSpec.expectedBody,
						headers: loadSpec.headers,
						requestParameters: loadSpec.requestParameters,
						numberOfSendingSlots: loadSpec.numberOfSendingSlots,
						rampUpTimeInSeconds: loadSpec.rampUpTimeInSeconds,
						fromNumberOfRequestPerSecond: loadSpec.fromNumberOfRequestPerSecond,
						currentSide: getCurrentSide(loadSpec.id),
						plotData : getCurrentPlotData(loadSpec.id)
					};
				}
 
				function listLoadResources (){
					loadServiceDao.getLoadResources().then(function(services) {
						loadServiceDao.getLoadResourceDetails(services.data).then(function(loadServiceDetails){
							var result = [];
							for(var i = 0; i < loadServiceDetails.length; i++) {
								var details = loadServiceDetails[i].data;
								result.push(toLoadResource(details));
							}
							$scope.loadResourceList = result;
						});
					})
				}
				
				
				function newLoadResource(){
					$scope.serviceUnderConstruction= true;
					$scope.loadResourceList.push({
						create: true,
						method: "GET",
						url: "",
						body: "",
						status: "Inactive",
						numberOfRequestPerSecond: "",
						currentSide: "flippable_front"
					});
				};
				
				function addResource() {
					$scope.serviceUnderConstruction = false;
				}
				
				function saveLoadResource(resource, index) {
					if(resource.create){
						createLoadResource(index);
					} else {
						updateLoadResource(resource);
					}	
				}				
				
				function updateLoadResource(resource) {
					console.log("hepp");
					loadServiceDao.updateLoadResource(resource);				
				}
				
				
				function createLoadResource(index) {
					loadServiceDao.createLoadResource($scope.loadResourceList[index]).then(function(resource) {
						$scope.loadResourceList.splice(index,1);
						$scope.loadResourceList.push(toLoadResource(resource.data));
					}).then(addResource);
				}
	
				function deleteLoadResource(resource, index) {
					if(!resource.create) {
						unWatchStatistics(resource);
						loadServiceDao.deleteLoadResource(resource);
						$scope.loadResourceList.splice(resourceIndex($scope.loadResourceList, resource),1);	
					} else {
						$scope.loadResourceList.splice(index,1);
						addResource();
					}
						
				}
				
				function resourceIndex(resourceList, resource) {
					return resourceList.findIndex(function(r) {
						return r.id === resource.id;
					});
				}
				
				function replaceLoadResource(resource) {
					loadServiceDao.getLoadResource(resource.id).then(function(data) {
						var newResource = data.data;
						var index = resourceIndex($scope.loadResourceList, newResource);
						var oldResource = $scope.loadResourceList[index];
						oldResource.method = newResource.method;
						oldResource.url = newResource.url;
						oldResource.body = newResource.body;
						oldResource.status = newResource.status;
						oldResource.numberOfRequestPerSecond = newResource.numberOfRequestPerSecond;
						oldResource.maxTimeForRequestInMillis = newResource.maxTimeForRequestInMillis;
						oldResource.expectedResponseCode = newResource.expectedResponseCode;
						oldResource.expectedBody = newResource.expectedBody;
						oldResource.headers = newResource.headers;
						oldResource.requestParameters = newResource.requestParameters;
						oldResource.numberOfSendingSlots = newResource.numberOfSendingSlots;
						oldResource.rampUpTimeInSeconds = newResource.rampUpTimeInSeconds;
						oldResource.fromNumberOfRequestPerSecond = newResource.fromNumberOfRequestPerSecond;
					});
				}
				
				function startSession(resource) {
					loadServiceDao.updateLoadResource(resource).then(function() {
						loadServiceDao.createSession(resource).then(function() { 
							replaceLoadResource(resource) 
						});
					});		
				}
				
				function stopSession(resource) {
					loadServiceDao.deleteSession(resource).then(function() { replaceLoadResource(resource) });
				}
				
				function updatePlot(plot, data) {
					var plotData = plot.data;
					var nextIndex = plotData[plotData.length-1]?(plotData[plotData.length-1][0] + 1):0; 
					if(plotData.length > maxNumberOfStatistics) {
						plotData.shift();
					}
					plotData.push([nextIndex,data]);
				}
				

				
				function handleWebsocketMessage(msg) {
					var data = JSON.parse(msg.data);
					var type = data.type;
					if(type === "statisticsEvents") {
						data.events.forEach(function(e){ handleStatisticEvent(e);});
					} else if(type === "statisticsEvent"){
						handleStatisticEvent(data);
					} else if (type === "fatalError"){
						handleFatalError(data);
					} else {
						console.log("Unknown websocket message: " + data);
					}
					
					$scope.$apply();
				}	
				
				function handleFatalError(data) {
					var resource = data.resource;
					var cause = data.cause;
					replaceLoadResource(resource);
					console.log("Fatal error: " + cause);
					toastr.error(cause, 'Fatal Error');
				}
				
				function updateSuccessfulPlot(resource, event) {
					var currentData = getResource(resource.id).plotData.successfulPlotData;	
					updatePlot(currentData[0], event.numberOfRequestsPerSecond);
					updatePlot(currentData[1], event.avargeLatancyInMillis);
					updatePlot(currentData[2], event.maxTimeInMillis);
					updatePlot(currentData[3], event.minTimeInMillis);
				}
				
				function updateFailedPlot(resource, event) {
					var currentData = getResource(resource.id).plotData.failedPlotData;	
					updatePlot(currentData[0], event.numberOfRequestsPerSecond);
				}
				
				function handleStatisticEvent(event) {
					var eventType = event.eventType
					if(eventType === "successful") {
						updateSuccessfulPlot(event.resource, event);
					} else if(eventType === "failed") {
						updateFailedPlot(event.resource, event);
					}
				}
				
				function watchStatistics(resource, index) {
					websocket.send(JSON.stringify({action:"watch", resource: {method: resource.method, url: resource.url, id: resource.id}}));
					
					var currentResource = getResource(resource.id); 
					
					if(!currentResource.plotData) {
						currentResource.plotData = {};
					}
					
					if(!currentResource.plotData.successfulPlotData) {
						currentResource.plotData.successfulPlotData = [{ label: "Req/s", data: []}, { label: "Avg Latancy", data: [], yaxis:2},{ label: "Max Latancy", data: [], yaxis:2},{ label: "Min Latancy", data: [], yaxis:2}];
					}
					
					if(!currentResource.plotData.failedPlotData) {
						currentResource.plotData.failedPlotData = [{ label: "Req/s", data: [], points: { symbol: "triangle"} }]; 
					}
				}
				
				function unWatchStatistics(resource) {
					websocket.send(JSON.stringify({action:"unWatch", resource: {method: resource.method, url: resource.url, id: resource.id}}));
				}

				function showInfo(index) {
					var resource = $scope.loadResourceList[index]; 
					if(resource.currentSide === "flippable_front") {
						resource.currentSide = "flippable_back";
						watchStatistics(resource, index);
					} else {
						resource.currentSide = "flippable_front";
					}
				}
				
				function getWsAddress() {
					var loc = window.location, new_uri;
					if (loc.protocol === "https:") {
					    new_uri = "wss:";
					} else {
					    new_uri = "ws:";
					}
					new_uri += "//" + loc.host;
					new_uri += loc.pathname + "ws";
					return new_uri;
				}
				
				
			} ]);


	return controllers;

});