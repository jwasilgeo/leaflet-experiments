var heathrowCoordinates = [51.4594, -0.4414],
  searchSizeM = 200000, // meters
  airplaneSpeciesIds = [0, 1, 2, 3, 5, 6],
  helicopterSpeciesId = 4,
  aircraftNode = document.querySelector('#aircraft'),
  aircraftSummaryNode = document.querySelector('#aircraftSummary'),
  aggregateSummaryStatsHTML,
  localSummaryStatsHTML,
  radarNode = document.querySelector('.radar');

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
  fillOpacity: 0.4,
  interactive: false
});

// aircraft marker group layers
var aircraftParallaxGroupLayer = L.featureGroup()
  .on('click mouseover', function(e) {
    aircraftParallaxGroupLayer.eachLayer(function(layer) {
      layer.getElement().style.color = '';
    });

    e.layer.getElement().style.color = 'deepskyblue';

    aircraftNode.innerHTML = [
      '<p>',
      e.layer._aircraftProperties.Mdl,
      '</p><p>',
      e.layer._aircraftProperties.Alt || '---',
      ' ft</p><hr>'
    ].join('');
  });

var aircraftShadowGroupLayer = L.featureGroup();

var worldwideAircraftGroupLayer = L.featureGroup();

var oldZoom = null;

var map = L.map('map', {
  center: [0, 0],
  zoom: 2,
  minZoom: 1,
  maxBounds: [
    [89, -250],
    [-89, 250]
  ],
  worldCopyJump: true,
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
  .on('zoomstart', function(e) {
    oldZoom = map.getZoom();
  })
  .on('zoom', function() {
    var newZoom = map.getZoom();
    toggleWorldwideLayer(oldZoom, newZoom);
    updateParallaxZOffset(oldZoom, newZoom);
  })
  .on('moveend', function() {
    wrapMarkers(worldwideAircraftGroupLayer);
  });

map.attributionControl.addAttribution('Aircraft data &copy; <a href="https://www.ADSBexchange.com" target="_blank">ADSBexchange</a>');

map.attributionControl.setPrefix(
  '<span class="author-credit"><a href="https://twitter.com/JWasilGeo" target="_blank">@JWasilGeo</a></span> | ' +
  map.attributionControl.options.prefix
);

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

function toggleWorldwideLayer(oldZoom, newZoom) {
  var thresholdZoom = 6;
  if (oldZoom < newZoom && newZoom >= thresholdZoom) {
    // zooming in and past a threshold
    //  - hide worldwide layer
    //  - show aircraft related layers
    if (map.hasLayer(worldwideAircraftGroupLayer)) {
      worldwideAircraftGroupLayer.remove();
    }

    if (!map.hasLayer(searchCircleLayer)) {
      searchCircleLayer.addTo(map);
      aircraftParallaxGroupLayer.addTo(map);
      aircraftShadowGroupLayer.addTo(map);
    }

    aircraftSummaryNode.innerHTML = localSummaryStatsHTML || aggregateSummaryStatsHTML;
  } else if (oldZoom > newZoom && newZoom <= thresholdZoom) {
    // zooming out and past a threshold
    //  - show worldwide layer
    //  - hide aircraft related layers
    if (!map.hasLayer(worldwideAircraftGroupLayer)) {
      worldwideAircraftGroupLayer.addTo(map);
    }

    if (map.hasLayer(searchCircleLayer)) {
      searchCircleLayer.remove();
      aircraftParallaxGroupLayer.remove();
      aircraftShadowGroupLayer.remove();
      L.DomUtil.empty(aircraftNode);
    }

    aircraftSummaryNode.innerHTML = aggregateSummaryStatsHTML;
  }
}

function updateParallaxZOffset(oldZoom, newZoom) {
  if (!map.hasLayer(searchCircleLayer)) {
    return;
  }

  var thresholdZoom = 10;
  if (oldZoom < newZoom && newZoom >= thresholdZoom) {
    // zooming in and past a threshold:
    //  - when the map's current zoom level is going to be greater than or equal to 10
    //    use a smaller parallaxZoffset (aircraft altitude divided by 90)
    aircraftParallaxGroupLayer.eachLayer(function(layer) {
      layer.options.parallaxZoffset = layer._aircraftProperties.Alt / 90;
    });
  } else if (oldZoom > newZoom && newZoom <= thresholdZoom) {
    // zooming out and past a threshold:
    //  - when the map's current zoom level is going to be less than 10
    //    revert to the original parallaxZoffset (aircraft altitude divided by 10)
    aircraftParallaxGroupLayer.eachLayer(function(layer) {
      layer.options.parallaxZoffset = layer._aircraftProperties.Alt / 10;
    });
  }
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

  latlng = latlng.wrap();

  searchCircleLayer.setLatLng(latlng);
  map.fitBounds(searchCircleLayer.getBounds());

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

      updateTerminator(terminator);

      var aircraftList = response.acList
        .filter(function(aircraft) {
          // ignore aircraft that are reporting themselves to be on the ground
          return !aircraft.Gnd;
        })
        .sort(function(aircraftA, aircraftB) {
          // sort ascending by altitude
          return aircraftA.Alt - aircraftB.Alt;
        });

      aggregateSummaryStatsHTML = [
        '<p><span style="color: deepskyblue; font-size: 1.3em; font-weight: bold;">',
        aircraftList.length,
        '</span> AIRCRAFT AROUND THE WORLD CURRENTLY REPORTING THEIR POSITION</p>',
        '<p style="font-style: italic;">CLICK ON THE MAP OR SEARCH FOR AN AIRPORT</p>'
      ].join('');

      aircraftSummaryNode.innerHTML = aggregateSummaryStatsHTML;

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
  L.DomUtil.empty(aircraftNode);
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

      updateTerminator(terminator);

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

      localSummaryStatsHTML = [
        '<p>AIRPLANES: ',
        airplaneCount,
        '</p><p>HELICOPTERS: ',
        helicopterCount,
        '</p><p>HIGHEST: ',
        highestAltitude,
        ' ft</p>'
      ].join('');

      aircraftSummaryNode.innerHTML = localSummaryStatsHTML;

      aircraftList.forEach(function(aircraftProperties) {
        // use Font Awesome's "fa-plane" icon for now
        // https://fontawesome.com/icons/plane?style=solid

        // show the aircraft in the sky using the parallax plugin
        var parallaxMarker = L.Marker.parallax(
          {
            lat: aircraftProperties.Lat,
            lng: aircraftProperties.Long
          }, {
            parallaxZoffset: aircraftProperties.Alt / 10, // use the altitude for the parallax z-offset value
            icon: L.divIcon({
              className: 'leaflet-marker-icon leaflet-zoom-animated leaflet-interactive',
              html: '<i class="fas fa-plane fa-2x" style="transform:rotate(calc(-45deg + ' + aircraftProperties.Trak + 'deg)) scale(' + Math.max(1, aircraftProperties.Alt / 10500) + ');" aria-hidden="true"></i>'
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
              html: '<i class="fas fa-plane fa-2x shadow" style="transform:rotate(calc(-45deg + ' + aircraftProperties.Trak + 'deg));" aria-hidden="true"></i>'
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

function wrapMarkers(groupLayer) {
  // ensure that the point features will be drawn beyond +/-180 longitude
  groupLayer.eachLayer(function(layer) {
    var wrappedLatLng = wrapAroundLatLng(layer.getLatLng());
    layer.setLatLng(wrappedLatLng);
  });
}

function wrapAroundLatLng(latLng) {
  var wrappedLatLng = latLng.clone();
  var mapCenterLng = map.getCenter().lng;
  var wrapAroundDiff = mapCenterLng - wrappedLatLng.lng;
  if (wrapAroundDiff < -180 || wrapAroundDiff > 180) {
    wrappedLatLng.lng += (Math.round(wrapAroundDiff / 360) * 360);
  }
  return wrappedLatLng;
}
