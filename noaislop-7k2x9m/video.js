/* Reproductor compartido de la landing y de booked/.
   montarVideo({ box, src, poster, evPlay, evProgress })
   - src vacio  -> se queda el hueco marcado.
   - src de YouTube (cualquier formato de link) -> reproductor limpio: sin barra
     para adelantar, sin controles, solo el boton de play de YouTube al
     principio; luego un toque pausa o sigue. Mide cuanto se ve.
   - src .mp4   -> <video> propio, tambien medido.
   Lo que YouTube no deja quitar: el titulo y su logo antes de darle play y al
   pausar, y los videos del mismo canal al final. */
(function(){
  function ytId(u){
    var m = String(u).match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/))([\w-]{11})/i);
    return m ? m[1] : "";
  }
  function pixel(nombre, datos){
    if(typeof fbq !== "undefined") fbq("trackCustom", nombre, datos || {});
  }
  /* Avisa al pasar 25/50/75/95 %. Una vez cada uno. */
  function medidor(evProgress){
    var hitos = { 25:false, 50:false, 75:false, 95:false };
    return function(actual, total){
      if(!total) return;
      var pct = actual / total * 100;
      Object.keys(hitos).forEach(function(k){
        if(!hitos[k] && pct >= +k){ hitos[k] = true; pixel(evProgress, { pct:+k }); }
      });
    };
  }

  var apiLista = null;
  function cargarApiYT(){
    if(apiLista) return apiLista;
    apiLista = new Promise(function(res){
      if(window.YT && window.YT.Player) return res();
      var prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = function(){ if(prev) prev(); res(); };
      var s = document.createElement("script");
      s.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(s);
    });
    return apiLista;
  }

  window.montarVideo = function(o){
    var box = o.box;
    if(!box || !o.src) return;
    var mide = medidor(o.evProgress);
    var id = ytId(o.src);

    if(id){
      /* Antes del primer play solo queda libre el centro (el boton de play de
         YouTube): arriba (titulo y canal) y abajo ("Ver en YouTube") se tapan
         para que nadie salga a YouTube. Un toque ahi tambien arranca el video. */
      box.innerHTML = '<div class="yt-host"></div>' +
        '<div class="yt-bloq yt-bloq--arriba"></div><div class="yt-bloq yt-bloq--abajo"></div>' +
        '<div class="yt-tapa" hidden></div>' +
        '<div class="yt-barra" hidden><div class="yt-pista"><b></b><i></i></div></div>';
      var tapa = box.querySelector(".yt-tapa");
      /* Barra de progreso: dice cuanto falta (sin ella la gente se desespera y
         se va) y deja volver atras, pero nunca pasar de lo ya visto. <b> marca
         hasta donde llego, <i> donde esta ahora. */
      var barra = box.querySelector(".yt-barra");
      var relleno = barra.querySelector("i"), vistoEl = barra.querySelector("b");
      cargarApiYT().then(function(){
        var arrancado = false, reloj = null, p = null, visto = 0;
        var pintarBarra = function(){
          var d = p && p.getDuration && p.getDuration();
          if(!d) return;
          var t = p.getCurrentTime();
          if(t > visto) visto = t;
          relleno.style.width = Math.min(100, t / d * 100) + "%";
          vistoEl.style.width = Math.min(100, visto / d * 100) + "%";
        };
        /* Velocidad por defecto (o.velocidad, p. ej. 1.25). Solo si YouTube la
           ofrece para ese video; si no, se queda en 1. */
        var ponerVelocidad = function(){
          if(!o.velocidad || !p.getAvailablePlaybackRates) return;
          if(p.getAvailablePlaybackRates().indexOf(o.velocidad) >= 0 && p.getPlaybackRate() !== o.velocidad)
            p.setPlaybackRate(o.velocidad);
        };
        /* Tocar o arrastrar la barra: se mueve a ese punto, pero nunca mas alla
           de lo ya visto. */
        var irA = function(ev){
          var d = p && p.getDuration && p.getDuration();
          if(!d) return;
          var rect = barra.getBoundingClientRect();
          var x = (ev.touches ? ev.touches[0].clientX : ev.clientX) - rect.left;
          var t = Math.max(0, Math.min(1, x / rect.width)) * d;
          p.seekTo(Math.min(t, visto), true);
          relleno.style.width = Math.min(t, visto) / d * 100 + "%";
        };
        var arrastrando = false;
        barra.addEventListener("pointerdown", function(ev){ arrastrando = true; ev.preventDefault(); ev.stopPropagation(); irA(ev); });
        window.addEventListener("pointermove", function(ev){ if(arrastrando) irA(ev); });
        window.addEventListener("pointerup", function(){ arrastrando = false; });
        barra.addEventListener("click", function(ev){ ev.stopPropagation(); });
        p = new YT.Player(box.querySelector(".yt-host"), {
          host: "https://www.youtube-nocookie.com",
          videoId: id,
          playerVars: { controls:0, disablekb:1, rel:0, playsinline:1, iv_load_policy:3, fs:0 },
          events: {
            onStateChange: function(e){
              if(e.data === YT.PlayerState.PLAYING){
                /* El primer toque va directo a YouTube (iPhone no deja arrancar
                   con sonido de otra forma). Despues se tapa el video: asi no
                   se puede pinchar el titulo ni salir a YouTube. */
                tapa.hidden = false; barra.hidden = false; box.classList.add("yt-arrancado");
                if(!arrancado){ arrancado = true; pixel(o.evPlay); }
                ponerVelocidad();
                if(!reloj) reloj = setInterval(function(){ mide(p.getCurrentTime(), p.getDuration()); pintarBarra(); }, 250);
              } else if(reloj){ clearInterval(reloj); reloj = null; pintarBarra(); }
              /* Al terminar la tapa se queda puesta (con el boton de play para
                 verlo otra vez): asi no se pueden pinchar los videos sugeridos. */
              box.classList.toggle("yt-pausado", e.data === YT.PlayerState.PAUSED || e.data === YT.PlayerState.ENDED);
              if(e.data === YT.PlayerState.ENDED){ mide(1, 1); visto = p.getDuration(); relleno.style.width = "100%"; vistoEl.style.width = "100%"; }
            }
          }
        });
        tapa.addEventListener("click", function(){
          var st = p.getPlayerState();
          if(st === YT.PlayerState.PLAYING) p.pauseVideo();
          else { if(st === YT.PlayerState.ENDED) p.seekTo(0, true); p.playVideo(); }
        });
        box.querySelectorAll(".yt-bloq").forEach(function(b){
          b.addEventListener("click", function(){ p.playVideo(); });
        });
      });
      return;
    }

    if(/^https?:\/\//i.test(o.src) && !/\.mp4(\?|$)/i.test(o.src)){
      /* Vimeo, Loom u otro: se incrusta tal cual, sin medir. */
      box.innerHTML = '<iframe src="'+o.src+'" title="Blitz" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>';
      return;
    }

    box.innerHTML = '<video playsinline preload="metadata"'+(o.poster ? ' poster="'+o.poster+'"' : '')+' controls>' +
      '<source src="'+o.src+'" type="video/mp4"></video>';
    var v = box.querySelector("video");
    v.addEventListener("timeupdate", function(){ mide(v.currentTime, v.duration); });
    v.addEventListener("play", function(){ pixel(o.evPlay); }, { once:true });
  };
})();
