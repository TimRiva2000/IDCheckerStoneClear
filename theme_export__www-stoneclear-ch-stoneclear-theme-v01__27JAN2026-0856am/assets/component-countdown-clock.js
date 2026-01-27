if ( typeof CountdownClock !== 'function' ) {

  class CountdownClock extends HTMLElement {

    constructor(){
      super();
      this.init();
    }

    init(){

      this.daysEl = this.querySelector('.days');
      this.hoursEl = this.querySelector('.hours');
      this.minutesEl = this.querySelector('.minutes');
      this.secondsEl = this.querySelector('.seconds');

      const date = this.dataset.date.split(',');
      this.COUNT = new Date(date[0], (date[1]-1), date[2], date[3]);

      const gmt = parseInt(this.dataset.timezone);
      const timezone = this.COUNT.getTimezoneOffset() / -60;

      if ( timezone != gmt ) {
        this.COUNT.setHours(parseInt(date[3]) + timezone - gmt );
      } 

      this._countdownBannerInterval = setInterval(this._countEachSecond.bind(this), 1000);
      this._countEachSecond();
      if ( this.classList.contains('hide') ) {
        this.classList.remove('hide');
      }

    }

    _countEachSecond(){

      const now = new Date().getTime(),
        distance = this.COUNT - now;

      const days = Math.floor(distance / (1000 * 60 * 60 * 24)),
        hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
        minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60)),
        seconds = Math.floor((distance % (1000 * 60)) / 1000);

      this.daysEl.innerHTML = days < 10 ? `<span>0</span><span>${days}</span>` : days.toString().split('').map(digit=>`<span>${digit}</span>`).join("");
      this.hoursEl.innerHTML = hours < 10 ? `<span>0</span><span>${hours}</span>` : hours.toString().split('').map(digit=>`<span>${digit}</span>`).join("");
      this.minutesEl.innerHTML = minutes < 10 ? `<span>0</span><span>${minutes}</span>` : minutes.toString().split('').map(digit=>`<span>${digit}</span>`).join("");
      this.secondsEl.innerHTML = seconds < 10 ? `<span>0</span><span>${seconds}</span>` : seconds.toString().split('').map(digit=>`<span>${digit}</span>`).join("");

      if ( distance < 0 ) {
        clearInterval(this._countdownBannerInterval);
        this.daysEl.innerHTML = '<span>0</span><span>0</span>';
        this.hoursEl.innerHTML = '<span>0</span><span>0</span>';
        this.minutesEl.innerHTML = '<span>0</span><span>0</span>';
        this.secondsEl.innerHTML = '<span>0</span><span>0</span>';
      }
    }

  }

  if ( typeof customElements.get('countdown-clock') == 'undefined' ) {
    customElements.define('countdown-clock', CountdownClock);
  }

}