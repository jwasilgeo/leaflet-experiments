
var heathrowCoordinates = [51.4594, -0.4414],
  searchSizeM = 200000, // meters
  airplaneSpeciesIds = [0, 1, 2, 3, 5, 6],
  helicopterSpeciesId = 4,
  aircraftNode = document.getElementById('aircraft'),
  aircraftSummaryNode = document.getElementById('aircraftSummary'),
  radarNode = document.getElementById('radar');

// search circle
var searchCircleLayer = L.circle(heathrowCoordinates, {
  radius: searchSizeM, // meters
  weight: 1,
  color: 'deepskyblue',
  fillOpacity: 0,
  interactive: false
});

var terminator = L.terminator({
  stroke: false,
  fillOpacity: 0.1,
  interactive: false
});

// aircraft marker group layers
var aircraftParallaxGroupLayer = L.featureGroup()
  // .on('mouseover', function(e) {
  //   aircraftNode.innerHTML = [
  //     '<p>',
  //     e.layer._aircraftProperties.Mdl,
  //     '</p><p>',
  //     e.layer._aircraftProperties.Alt,
  //     ' ft</p>'
  //   ].join('');
  // })
  // .on('mouseout', function() {
  //   L.DomUtil.empty(aircraftNode);
  // });
  .bindTooltip(function(layer) {
    // return [
    //   '<p>',
    //   layer._aircraftProperties.Mdl,
    //   '</p><p>',
    //   layer._aircraftProperties.Alt,
    //   ' ft</p>'
    // ].join('');
    return L.tooltip({
      offset: layer._calculateOffsetFromOrigin(map.getCenter()).containerPoint
    }, layer);
    // .setContent([
    //   '<p>',
    //   layer._aircraftProperties.Mdl,
    //   '</p><p>',
    //   layer._aircraftProperties.Alt,
    //   ' ft</p>'
    // ].join(''));
  });

var aircraftShadowGroupLayer = L.featureGroup();

var worldwideAircraftGroupLayer = L.featureGroup();

var map = L.map('map', {
  center: [0, 0],
  zoom: 2,
  minZoom: 2,
  maxBounds: [
    [89, -195],
    [-89, 195]
  ],
  // worldCopyJump: true,
  layers: [
    L.esri.basemapLayer('Gray'),
    L.esri.basemapLayer('GrayLabels'),
    terminator,
    aircraftShadowGroupLayer,
    aircraftParallaxGroupLayer,
    worldwideAircraftGroupLayer
  ],
  preferCanvas: true
})
  .on('click', function(e) {
    handleGeosearchOrClick(e.latlng);
  })
  .on('zoomanim', function(e) {
    var currentZoom = map.getZoom(),
      futureZoom = e.zoom;

    toggleWorldwideLayer(currentZoom, futureZoom);
    updateParallaxZOffset(currentZoom, futureZoom);
  });

map.attributionControl.addAttribution('Aircraft data &copy; <a href="https://www.ADSBexchange.com" target="_blank">ADSBexchange</a>');

L.esri.Geocoding.geosearch({
  placeholder: 'SEARCH FOR AN AIRPORT',
  position: 'topright',
  collapseAfterResult: false,
  expanded: true,
  zoomToResult: false,
  providers: [
    L.esri.Geocoding.arcgisOnlineProvider({
      categories: 'Airport'
    })
  ]
})
  .on('results', function(data) {
    if (data.results.length) {
      handleGeosearchOrClick(data.results[0].latlng);
    }
  })
  .addTo(map);

// initially display aircraft reporting their location around the world
generateAircraftWorldwide();

// setTimeout(function() {
//   handleGeosearchOrClick(L.latLng(heathrowCoordinates));
// }, 10000);

function toggleWorldwideLayer(currentZoom, futureZoom) {
  var thresholdZoom = 7;
  if (currentZoom < thresholdZoom && futureZoom >= thresholdZoom) {
    // zooming in past a threshold
    //  - hide worldwide layer
    //  - show individual aircraft related layers
    if (map.hasLayer(worldwideAircraftGroupLayer)) {
      worldwideAircraftGroupLayer.remove();
    }

    if (!map.hasLayer(searchCircleLayer)) {
      searchCircleLayer.addTo(map);
      aircraftParallaxGroupLayer.addTo(map);
      aircraftShadowGroupLayer.addTo(map);
    }
  } else if (currentZoom >= thresholdZoom && futureZoom < thresholdZoom) {
    // zooming out past a threshold
    //  - show worldwide layer
    //  - hide individual aircraft related layers
    if (!map.hasLayer(worldwideAircraftGroupLayer)) {
      worldwideAircraftGroupLayer.addTo(map);
    }

    if (map.hasLayer(searchCircleLayer)) {
      searchCircleLayer.remove();
      aircraftParallaxGroupLayer.remove();
      aircraftShadowGroupLayer.remove();
    }
  } else {
    // when the map changes between other zoom levels:
    //  - do nothing and short-circuit
    return false;
  }
}

function updateParallaxZOffset(currentZoom, futureZoom) {
  var thresholdZoom = 10,
    modifier = 1;

  if (currentZoom < thresholdZoom && futureZoom >= thresholdZoom) {
    // zooming in past a threshold:
    //  - when the map's current zoom level is going to be greater than or equal to 10
    //  - use a smaller parallaxZoffset (aircraft altitude divided by 90)
    modifier = (1 / 9);
  } else if (currentZoom >= thresholdZoom && futureZoom < thresholdZoom) {
    // zooming out past a threshold:
    //  - when the map's current zoom level is going to be less than 10,
    //  - revert to the original parallaxZoffset (aircraft altitude divided by 10)
    modifier = 9;
  } else {
    // when the map changes between other zoom levels:
    //  - do nothing and short-circuit
    return false;
  }

  aircraftParallaxGroupLayer.eachLayer(function(layer) {
    layer.options.parallaxZoffset *= modifier;
  });

  return true;
}

function handleGeosearchOrClick(latlng) {
  if (map.hasLayer(worldwideAircraftGroupLayer)) {
    worldwideAircraftGroupLayer.remove();
  }

  if (!map.hasLayer(searchCircleLayer)) {
    searchCircleLayer.addTo(map);
    aircraftParallaxGroupLayer.addTo(map);
    aircraftShadowGroupLayer.addTo(map);
  }

  searchCircleLayer.setLatLng(latlng);
  map.flyToBounds(searchCircleLayer.getBounds());

  // if (map.getBoundsZoom(searchCircleLayer.getBounds()) > map.getZoom()) {
  //   map.flyToBounds(searchCircleLayer.getBounds());
  // } else {
  //   map.flyTo(latlng);
  // }

  generateAircraftAtLatLng(latlng);
}

function generateAircraftWorldwide() {
  radarNode.classList.remove('off');

  // remove all the previous aircraft from the map
  worldwideAircraftGroupLayer.clearLayers();

  $.ajax({
    url: 'https://public-api.adsbexchange.com/VirtualRadar/AircraftList.json',
    data: {
      fNBnd: 89,
      fSBnd: -89,
      fWBnd: -179.99,
      fEBnd: 179.99
    },
    dataType: 'jsonp'
  })
    .done(function(response) {
      radarNode.classList.add('off');

      terminator = updateTerminator(terminator);

      var aircraftList = response.acList
        .filter(function(aircraft) {
          // ignore aircraft that are reporting themselves to be on the ground
          return !aircraft.Gnd;
        })
        .sort(function(aircraftA, aircraftB) {
          // sort ascending by altitude
          return aircraftA.Alt - aircraftB.Alt;
        });

      var summaryStatsHTML = [
        '<p>',
        aircraftList.length,
        ' AIRCRAFT AROUND THE WORLD CURRENTLY REPORTING THEIR POSITION</p>',
        '<p>CLICK ON THE MAP OR SEARCH FOR AN AIRPORT</p>'
      ].join('');

      aircraftSummaryNode.innerHTML = summaryStatsHTML;

      aircraftList.forEach(function(aircraft) {
        var simpleCircleMarker = L.circleMarker([aircraft.Lat, aircraft.Long], {
          radius: 2, // pixels,
          interactive: false,
          stroke: false,
          fillOpacity: 0.3,
          fillColor: 'deepskyblue'
        });

        worldwideAircraftGroupLayer.addLayer(simpleCircleMarker);
      });
    })
    .fail(function(error) {
      radarNode.classList.add('off');
      console.error(error);
    });
}

function generateAircraftAtLatLng(latlng) {
  radarNode.classList.remove('off');
  L.DomUtil.empty(aircraftSummaryNode);

  // remove all the previous aircraft from the map
  aircraftParallaxGroupLayer.clearLayers();
  aircraftShadowGroupLayer.clearLayers();

  var latlng = latlng.wrap();

  $.ajax({
    url: 'https://public-api.adsbexchange.com/VirtualRadar/AircraftList.json',
    data: {
      lat: latlng.lat,
      lng: latlng.lng,
      fDstL: 0,
      fDstU: (searchSizeM / 1000), // km
    },
    dataType: 'jsonp'
  })
    .done(function(response) {
      radarNode.classList.add('off');

      var aircraftList = response.acList
        .filter(function(aircraft) {
          // ignore aircraft that are reporting themselves to be on the ground
          return !aircraft.Gnd;
        })
        .sort(function(aircraftA, aircraftB) {
          // sort ascending by altitude
          return aircraftA.Alt - aircraftB.Alt;
        });

      var airplaneCount = aircraftList.filter(function(aircraft) {
        return airplaneSpeciesIds.indexOf(aircraft.Species) > -1;
      }).length;

      var helicopterCount = aircraftList.filter(function(aircraft) {
        return aircraft.Species === helicopterSpeciesId;
      }).length;

      var highestAltitude = aircraftList
        .map(function(aircraft) {
          return aircraft.Alt || 0;
        })
        .reduce(function(previousValue, currentValue) {
          return Math.max(previousValue, currentValue);
        }, 0);

      var summaryStatsHTML = [
        '<p>AIRPLANES: ',
        airplaneCount,
        '</p><p>HELICOPTERS: ',
        helicopterCount,
        '</p><p>HIGHEST: ',
        highestAltitude,
        ' ft</p><p>CLICK ON THE MAP OR SEARCH FOR AN AIRPORT</p>'
      ].join('');

      aircraftSummaryNode.innerHTML = summaryStatsHTML;

      aircraftList.forEach(function(aircraftProperties) {
        // use Font Awesome's "fa-plane" icon for now
        // http://fontawesome.io/icon/plane/

        // show the aircraft in the sky using the parallax plugin
        var parallaxMarker = L.Marker.parallax(
          {
            lat: aircraftProperties.Lat,
            lng: aircraftProperties.Long
          }, {
            parallaxZoffset: aircraftProperties.Alt / 10, // use the altitude for the parallax z-offset value
            icon: L.divIcon({
              className: 'leaflet-marker-icon leaflet-zoom-animated leaflet-interactive',
              html: '<i class="fa fa-plane fa-2x" style="transform:rotate(calc(-45deg + ' + aircraftProperties.Trak + 'deg)) scale(' + Math.max(1, aircraftProperties.Alt / 10500) + ')" aria-hidden="true"></i>'
            })
          }
        );

        // hold onto the aircraft info for later usage
        parallaxMarker._aircraftProperties = aircraftProperties;

        // show the "shadow" of the aircraft at its reported coordinates on the ground
        var shadowMarker = L.marker(
          {
            lat: aircraftProperties.Lat,
            lng: aircraftProperties.Long
          }, {
            icon: L.divIcon({
              className: 'leaflet-marker-icon leaflet-zoom-animated',
              html: '<i class="fa fa-plane fa-2x shadow" style="transform:rotate(calc(-45deg + ' + aircraftProperties.Trak + 'deg))" aria-hidden="true"></i>'
            }),
            interactive: false,
            pane: 'shadowPane'
          }
        );

        aircraftParallaxGroupLayer.addLayer(parallaxMarker);
        aircraftShadowGroupLayer.addLayer(shadowMarker);
      });
    })
    .fail(function(error) {
      radarNode.classList.add('off');
      console.error(error);
    });
}

function updateTerminator(terminator) {
  var newTerminator = L.terminator();
  terminator.setLatLngs(newTerminator.getLatLngs());
  terminator.redraw();
  return terminator;
}
