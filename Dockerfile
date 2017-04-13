FROM simonlammer/rpi-base-ubuntu

LABEL maintainer "Simon Lammer <lammer.simon@gmail.com>"

RUN \
	apt-get update && \
	apt-get upgrade -y && \
	\
	\
	true
	#apt-get clean && \
	#rm -rf /var/lib/apt/lists/*

RUN \
	apt-get install -y webfs

VOLUME ["/handlers"]
VOLUME ["/code"]
ENTRYPOINT ["/bin/entrypoint.sh"]
